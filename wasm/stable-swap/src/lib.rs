//! Dependency-free WebAssembly build of the StableSwap client math.
//!
//! The TypeScript implementation in `packages/integrations/src/stable-swap.ts`
//! uses arbitrary-precision `bigint`. WASM has fixed-width integers, so this
//! module uses `u128` slots and checked arithmetic; values outside the u128
//! range return an error instead of wrapping. For normal token amounts the two
//! implementations produce identical results.
//!
//! ABI (little-endian, 16 bytes per argument/result slot):
//! - every exported calculation receives `args_ptr` pointing to N consecutive
//!   u128 slots and writes results into `out_ptr` slots;
//! - numeric inputs that are conceptually u32 (fees, thresholds) occupy the
//!   low 4 bytes of a slot;
//! - returned error codes: 0 ok, 1 invalid input, 2 overflow, 3 convergence,
//!   4 invalid expression, 5 division by zero.

const BASIS_POINTS: u128 = 10_000;
const MINIMUM_LIQUIDITY: u128 = 1_000;
const MAX_ITERATIONS: usize = 255;
const ORACLE_SCALE: u128 = 1_000_000_000;

pub const E_INVALID: i32 = 1;
pub const E_OVERFLOW: i32 = 2;
pub const E_CONVERGENCE: i32 = 3;
pub const E_EXPRESSION: i32 = 4;
pub const E_DIV_ZERO: i32 = 5;

// Fixed, page-aligned scratch areas inside linear memory. JS writes arguments
// directly into these addresses and reads results back from them.
const ARGS_PTR: i32 = 1_024;
const OUT_PTR: i32 = 2_048;
const EXPR_PTR: i32 = 4_096;
const VARS_PTR: i32 = 8_192;

#[no_mangle]
pub extern "C" fn sw_args_ptr() -> i32 { ARGS_PTR }
#[no_mangle]
pub extern "C" fn sw_out_ptr() -> i32 { OUT_PTR }
#[no_mangle]
pub extern "C" fn sw_expr_ptr() -> i32 { EXPR_PTR }
#[no_mangle]
pub extern "C" fn sw_vars_ptr() -> i32 { VARS_PTR }
#[no_mangle]
pub extern "C" fn sw_version() -> i32 { 1 }

type R<T> = Result<T, i32>;

fn add(a: u128, b: u128) -> R<u128> { a.checked_add(b).ok_or(E_OVERFLOW) }
fn sub(a: u128, b: u128) -> R<u128> { a.checked_sub(b).ok_or(E_OVERFLOW) }
fn mul(a: u128, b: u128) -> R<u128> { a.checked_mul(b).ok_or(E_OVERFLOW) }
fn div(a: u128, b: u128) -> R<u128> {
    if b == 0 { return Err(E_DIV_ZERO) }
    a.checked_div(b).ok_or(E_OVERFLOW)
}
fn diff(a: u128, b: u128) -> u128 { if a > b { a - b } else { b - a } }

unsafe fn arg(ptr: *const u8, index: usize) -> u128 {
    let mut bytes = [0u8; 16];
    std::ptr::copy_nonoverlapping(ptr.add(index * 16), bytes.as_mut_ptr(), 16);
    u128::from_le_bytes(bytes)
}

unsafe fn put(ptr: *mut u8, index: usize, value: u128) {
    let bytes = value.to_le_bytes();
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr.add(index * 16), 16);
}

unsafe fn write_results(ptr: *mut u8, values: &[u128], code: i32) -> i32 {
    if code == 0 {
        for (i, value) in values.iter().enumerate() {
            put(ptr, i, *value);
        }
    }
    code
}

/// Compute the StableSwap invariant D for a two-token pool.
fn compute_d(reserve_a: u128, reserve_b: u128, amp: u128) -> R<u128> {
    if reserve_a == 0 || reserve_b == 0 || amp == 0 { return Err(E_INVALID) }

    let sum = add(reserve_a, reserve_b)?;
    let ann = mul(amp, 4)?;
    let mut d = sum;

    for _ in 0..MAX_ITERATIONS {
        let previous = d;
        // D_P = D³ / (4·x·y), applied one division at a time to avoid
        // overflowing u128 on the intermediate cube.
        let dp = div(
            mul(div(mul(d, d)?, mul(reserve_a, 2)?)?, d)?,
            mul(reserve_b, 2)?,
        )?;
        let numerator = mul(add(mul(ann, sum)?, mul(dp, 2)?)?, d)?;
        let denominator = add(mul(sub(ann, 1)?, d)?, mul(dp, 3)?)?;
        d = div(numerator, denominator)?;
        if diff(d, previous) <= 1 { return Ok(d) }
    }
    Err(E_CONVERGENCE)
}

/// Solve for the output reserve that preserves D after depositing `reserve_other`.
fn compute_y(reserve_other: u128, d: u128, amp: u128) -> R<u128> {
    if reserve_other == 0 || amp == 0 { return Err(E_INVALID) }

    let ann = mul(amp, 4)?;
    let b = add(reserve_other, div(d, ann)?)?;
    let c = div(
        mul(mul(d, d)?, d)?,
        mul(mul(reserve_other, 4)?, ann)?,
    )?;
    let mut y = d;

    for _ in 0..MAX_ITERATIONS {
        let previous = y;
        let numerator = add(mul(y, y)?, c)?;
        // Order matters: 2y + b - d, not 2y + (b - d), which can underflow.
        let denominator = sub(add(mul(y, 2)?, b)?, d)?;
        y = div(numerator, denominator)?;
        if diff(y, previous) <= 1 { return Ok(y) }
    }
    Err(E_CONVERGENCE)
}

fn dynamic_fee(
    base_fee_bps: u32,
    max_fee_bps: u32,
    new_reserve_in: u128,
    new_reserve_out: u128,
    oracle_price_in: u128,
    oracle_price_out: u128,
    depeg_threshold_bps: u32,
) -> R<u32> {
    if base_fee_bps > max_fee_bps || depeg_threshold_bps == 0 { return Err(E_INVALID) }
    if oracle_price_out == 0 { return Err(E_INVALID) }

    let total = add(new_reserve_in, new_reserve_out)?;
    let imbalance = if total == 0 {
        0
    } else {
        div(mul(diff(new_reserve_in, new_reserve_out), BASIS_POINTS)?, total)?
    };
    let ratio = div(mul(oracle_price_in, BASIS_POINTS)?, oracle_price_out)?;
    let deviation = diff(ratio, BASIS_POINTS);
    let stress = if imbalance > deviation { imbalance } else { deviation };
    let cap = if stress < depeg_threshold_bps as u128 { stress } else { depeg_threshold_bps as u128 };
    let fee = add(
        base_fee_bps as u128,
        div(mul((max_fee_bps - base_fee_bps) as u128, cap)?, depeg_threshold_bps as u128)?,
    )?;
    Ok(fee.min(max_fee_bps as u128) as u32)
}

fn quote(args: *const u8) -> R<[u128; 3]> {
    let reserve_in = unsafe { arg(args, 0) };
    let reserve_out = unsafe { arg(args, 1) };
    let amount_in = unsafe { arg(args, 2) };
    let amp = unsafe { arg(args, 3) };
    let base_fee = unsafe { arg(args, 4) } as u32;
    let max_fee = unsafe { arg(args, 5) } as u32;
    let price_in = unsafe { arg(args, 6) };
    let price_out = unsafe { arg(args, 7) };
    let threshold = unsafe { arg(args, 8) } as u32;

    if amount_in == 0 { return Err(E_INVALID) }
    let d = compute_d(reserve_in, reserve_out, amp)?;
    let new_in = add(reserve_in, amount_in)?;
    let new_out = compute_y(new_in, d, amp)?;
    let raw_out = sub(reserve_out, new_out)?;
    if raw_out == 0 { return Err(E_INVALID) }

    let fee_bps = dynamic_fee(base_fee, max_fee, new_in, new_out, price_in, price_out, threshold)?;
    let fee_amount = div(mul(raw_out, fee_bps as u128)?, BASIS_POINTS)?;
    Ok([sub(raw_out, fee_amount)?, fee_amount, fee_bps as u128])
}

#[no_mangle]
pub unsafe extern "C" fn sw_compute_d(args: *const u8, out: *mut u8) -> i32 {
    match compute_d(arg(args, 0), arg(args, 1), arg(args, 2)) {
        Ok(value) => write_results(out, &[value], 0),
        Err(code) => code,
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_compute_y(args: *const u8, out: *mut u8) -> i32 {
    match compute_y(arg(args, 0), arg(args, 1), arg(args, 2)) {
        Ok(value) => write_results(out, &[value], 0),
        Err(code) => code,
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_dynamic_fee(args: *const u8, out: *mut u8) -> i32 {
    let result = dynamic_fee(
        arg(args, 0) as u32,
        arg(args, 1) as u32,
        arg(args, 2), arg(args, 3), arg(args, 4), arg(args, 5),
        arg(args, 6) as u32,
    );
    match result {
        Ok(value) => write_results(out, &[value as u128], 0),
        Err(code) => code,
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_quote(args: *const u8, out: *mut u8) -> i32 {
    match quote(args) {
        Ok(values) => write_results(out, &values, 0),
        Err(code) => code,
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_lp_mint(args: *const u8, out: *mut u8) -> i32 {
    let (before_a, before_b, after_a, after_b, supply, amp) = (
        arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4), arg(args, 5),
    );
    let result = (|| -> R<u128> {
        if supply == 0 {
            let d = compute_d(after_a, after_b, amp)?;
            if d <= MINIMUM_LIQUIDITY { return Err(E_INVALID) }
            sub(d, MINIMUM_LIQUIDITY)
        } else {
            let before = compute_d(before_a, before_b, amp)?;
            let after = compute_d(after_a, after_b, amp)?;
            if after < before { return Err(E_INVALID) }
            div(mul(supply, sub(after, before)?)?, before)
        }
    })();
    match result {
        Ok(value) => write_results(out, &[value], 0),
        Err(code) => code,
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_withdraw(args: *const u8, out: *mut u8) -> i32 {
    let reserve_a = arg(args, 0);
    let reserve_b = arg(args, 1);
    let lp_amount = arg(args, 2);
    let supply = arg(args, 3);
    let result = (|| -> R<[u128; 2]> {
        if lp_amount == 0 || supply == 0 || reserve_a == 0 || reserve_b == 0 {
            return Err(E_INVALID)
        }
        let a = div(mul(reserve_a, lp_amount)?, supply)?;
        let b = div(mul(reserve_b, lp_amount)?, supply)?;
        if a == 0 || b == 0 { return Err(E_INVALID) }
        Ok([a, b])
    })();
    match result {
        Ok(values) => write_results(out, &values, 0),
        Err(code) => code,
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_peg_delta(args: *const u8, out: *mut u8) -> i32 {
    let result = (|| -> R<u128> {
        let price = arg(args, 0);
        div(mul(diff(price, ORACLE_SCALE), BASIS_POINTS)?, ORACLE_SCALE)
    })();
    match result {
        Ok(value) => write_results(out, &[value], 0),
        Err(code) => code,
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_check_depeg(args: *const u8, out: *mut u8) -> i32 {
    let result = (|| -> R<u128> {
        let price_a = arg(args, 0);
        let price_b = arg(args, 1);
        let max_bps = arg(args, 2) as u128;
        let deviation = div(mul(ORACLE_SCALE, max_bps)?, BASIS_POINTS)?;
        let lower = ORACLE_SCALE.saturating_sub(deviation);
        let upper = ORACLE_SCALE.saturating_add(deviation);
        let depegged = price_a < lower || price_a > upper || price_b < lower || price_b > upper;
        Ok(depegged as u128)
    })();
    match result {
        Ok(value) => write_results(out, &[value], 0),
        Err(code) => code,
    }
}

// ---------------------------------------------------------------------------
// Safe arithmetic-expression evaluator (no eval, no function calls)
// ---------------------------------------------------------------------------

struct Expr<'a> {
    bytes: &'a [u8],
    pos: usize,
    vars: &'a [u8],
}

impl<'a> Expr<'a> {
    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }

    fn peek(&mut self) -> Option<u8> {
        self.skip_ws();
        self.bytes.get(self.pos).copied()
    }

    fn take(&mut self) -> Option<u8> {
        let ch = self.peek()?;
        self.pos += 1;
        Some(ch)
    }

    fn parse(mut self) -> R<i128> {
        let value = self.additive()?;
        self.skip_ws();
        if self.pos != self.bytes.len() { return Err(E_EXPRESSION) }
        Ok(value)
    }

    fn additive(&mut self) -> R<i128> {
        let mut left = self.multiplicative()?;
        loop {
            match self.peek() {
                Some(b'+') => { self.take(); let right = self.multiplicative()?; left = left.checked_add(right).ok_or(E_OVERFLOW)? }
                Some(b'-') => { self.take(); let right = self.multiplicative()?; left = left.checked_sub(right).ok_or(E_OVERFLOW)? }
                _ => return Ok(left),
            }
        }
    }

    fn multiplicative(&mut self) -> R<i128> {
        let mut left = self.unary()?;
        loop {
            match self.peek() {
                Some(b'*') => { self.take(); let right = self.unary()?; left = left.checked_mul(right).ok_or(E_OVERFLOW)? }
                Some(b'/') => { self.take(); let right = self.unary()?; left = left.checked_div(right).ok_or(E_DIV_ZERO)? }
                Some(b'%') => { self.take(); let right = self.unary()?; left = left.checked_rem(right).ok_or(E_DIV_ZERO)? }
                _ => return Ok(left),
            }
        }
    }

    fn unary(&mut self) -> R<i128> {
        match self.peek() {
            Some(b'-') => { self.take(); self.unary()?.checked_neg().ok_or(E_OVERFLOW) }
            Some(b'+') => { self.take(); self.unary() }
            _ => self.primary(),
        }
    }

    fn lookup(&self, name: &[u8]) -> Option<i128> {
        let mut pos = 0;
        while pos + 4 <= self.vars.len() {
            let len = u32::from_le_bytes(self.vars[pos..pos + 4].try_into().ok()?) as usize;
            pos += 4;
            if pos + len + 16 > self.vars.len() { return None }
            if &self.vars[pos..pos + len] == name {
                let mut bytes = [0u8; 16];
                bytes.copy_from_slice(&self.vars[pos + len..pos + len + 16]);
                return Some(i128::from_le_bytes(bytes))
            }
            pos += len + 16;
        }
        None
    }

    fn primary(&mut self) -> R<i128> {
        match self.peek() {
            Some(b'(') => {
                self.take();
                let value = self.additive()?;
                match self.take() {
                    Some(b')') => Ok(value),
                    _ => Err(E_EXPRESSION),
                }
            }
            Some(ch) if ch.is_ascii_digit() => {
                let mut value: i128 = 0;
                while let Some(ch) = self.peek() {
                    if !ch.is_ascii_digit() { break }
                    self.take();
                    let digit = (ch - b'0') as i128;
                    value = value.checked_mul(10).and_then(|v| v.checked_add(digit)).ok_or(E_OVERFLOW)?;
                }
                Ok(value)
            }
            Some(ch) if ch.is_ascii_alphabetic() || ch == b'_' => {
                let mut name = [0u8; 64];
                let mut len = 0;
                while let Some(ch) = self.peek() {
                    if !(ch.is_ascii_alphanumeric() || ch == b'_') { break }
                    self.take();
                    if len >= name.len() { return Err(E_EXPRESSION) }
                    name[len] = ch;
                    len += 1;
                }
                self.lookup(&name[..len]).ok_or(E_EXPRESSION)
            }
            _ => Err(E_EXPRESSION),
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn sw_eval(
    expr_ptr: *const u8,
    expr_len: i32,
    vars_ptr: *const u8,
    vars_len: i32,
    out: *mut u8,
) -> i32 {
    if expr_len < 0 || vars_len < 0 || expr_len as usize > 4_096 || vars_len as usize > 4_096 {
        return E_EXPRESSION
    }
    let parser = Expr {
        bytes: std::slice::from_raw_parts(expr_ptr, expr_len as usize),
        pos: 0,
        vars: std::slice::from_raw_parts(vars_ptr, vars_len as usize),
    };
    match parser.parse() {
        Ok(value) => write_results(out, &[value as u128], 0),
        Err(code) => code,
    }
}
