/**
 * WebAssembly-backed StableSwap client math.
 *
 * The WASM module is built from `wasm/stable-swap` with
 * `npm run build:wasm` and ships as `assets/stable_swap.wasm`. It mirrors the
 * TypeScript implementation in `stable-swap.ts`; callers can use the `Auto`
 * helpers to get the WASM result when available and a transparent TypeScript
 * fallback otherwise.
 */

import {
  calculateDynamicFeeBps,
  calculateLpMintAmount,
  calculatePegDeltaBps,
  calculateSwapOutput,
  calculateWithdrawAmounts,
  checkDepeg,
  computeD,
  computeY,
  evaluateExpression,
} from './stable-swap.js'
import type { SwapQuote } from './stable-swap.js'

const SLOT_BYTES = 16
const U128_MASK = (1n << 128n) - 1n
const SIGN_BIT = 1n << 127n
const MAX_BUFFER = 4096
const WASM_URL = new URL('../assets/stable_swap.wasm', import.meta.url)

interface WasmExports {
  memory: WebAssembly.Memory
  sw_version(): number
  sw_args_ptr(): number
  sw_out_ptr(): number
  sw_expr_ptr(): number
  sw_vars_ptr(): number
  sw_compute_d(args: number, out: number): number
  sw_compute_y(args: number, out: number): number
  sw_dynamic_fee(args: number, out: number): number
  sw_quote(args: number, out: number): number
  sw_lp_mint(args: number, out: number): number
  sw_withdraw(args: number, out: number): number
  sw_peg_delta(args: number, out: number): number
  sw_check_depeg(args: number, out: number): number
  sw_eval(expr: number, exprLen: number, vars: number, varsLen: number, out: number): number
}

const ERROR_MESSAGES: Record<number, string> = {
  1: 'Invalid input',
  2: 'Math overflow (values must fit in 128 bits)',
  3: 'Convergence failed in Newton method',
  4: 'Invalid expression',
  5: 'Division by zero',
}

let loading: Promise<WasmExports | null> | undefined

/** Load and instantiate the WASM module. Safe to call repeatedly. */
export function initStableSwapWasm(
  source?: BufferSource | string | URL,
): Promise<WasmExports | null> {
  if (!loading) {
    loading = instantiate(source)
      .then((exports) => {
        if (exports.sw_version() !== 1) throw new Error('Unsupported StableSwap WASM ABI')
        return exports
      })
      .catch(() => null)
  }
  return loading
}

async function instantiate(source?: BufferSource | string | URL): Promise<WasmExports> {
  let input: BufferSource
  if (source instanceof URL || typeof source === 'string') {
    input = await fetchWasm(source)
  } else if (source) {
    input = source
  } else {
    input = await fetchWasm(WASM_URL)
  }
  const result = await WebAssembly.instantiate(input, {})
  return result.instance.exports as unknown as WasmExports
}

async function fetchWasm(url: string | URL): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`WASM fetch failed: ${response.status}`)
  return response.arrayBuffer()
}

/** True when the WASM module is available in this environment. */
export async function isStableSwapWasmReady(): Promise<boolean> {
  return (await initStableSwapWasm()) !== null
}

function ensure(exports: WasmExports | null): WasmExports {
  if (!exports) throw new Error('StableSwap WASM module is unavailable')
  return exports
}

function writeSlot(view: DataView, offset: number, value: bigint): void {
  const unsigned = value < 0n ? value & U128_MASK : value
  view.setBigUint64(offset, unsigned & ((1n << 64n) - 1n), true)
  view.setBigUint64(offset + 8, unsigned >> 64n, true)
}

function readSlot(view: DataView, offset: number, signed: boolean): bigint {
  const value = (view.getBigUint64(offset + 8, true) << 64n) | view.getBigUint64(offset, true)
  return signed && value >= SIGN_BIT ? value - (1n << 128n) : value
}

function check(code: number): void {
  if (code !== 0) throw new Error(ERROR_MESSAGES[code] ?? `StableSwap WASM error ${code}`)
}

async function call(
  fn: (wasm: WasmExports, args: number, out: number) => number,
  args: bigint[],
  resultCount: number,
): Promise<bigint[]> {
  const wasm = ensure(await initStableSwapWasm())
  const view = new DataView(wasm.memory.buffer)
  const argsPtr = wasm.sw_args_ptr()
  const outPtr = wasm.sw_out_ptr()
  args.forEach((value, index) => writeSlot(view, argsPtr + index * SLOT_BYTES, value))
  check(fn(wasm, argsPtr, outPtr))
  return Array.from({ length: resultCount }, (_, index) =>
    readSlot(view, outPtr + index * SLOT_BYTES, false))
}

function encodeVariables(variables: Record<string, bigint>): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  let total = 0
  for (const [name, value] of Object.entries(variables)) {
    const nameBytes = encoder.encode(name)
    const header = new Uint8Array(4)
    new DataView(header.buffer).setUint32(0, nameBytes.length, true)
    const slot = new Uint8Array(SLOT_BYTES)
    writeSlot(new DataView(slot.buffer), 0, value)
    chunks.push(header, nameBytes, slot)
    total += header.length + nameBytes.length + slot.length
  }
  if (total > MAX_BUFFER) throw new Error('Too many expression variables')
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export async function wasmComputeD(reserveA: bigint, reserveB: bigint, amp: bigint): Promise<bigint> {
  const [value] = await call((wasm, a, o) => wasm.sw_compute_d(a, o), [reserveA, reserveB, amp], 1)
  return value!
}

export async function wasmComputeY(reserveOther: bigint, d: bigint, amp: bigint): Promise<bigint> {
  const [value] = await call((wasm, a, o) => wasm.sw_compute_y(a, o), [reserveOther, d, amp], 1)
  return value!
}

export async function wasmDynamicFeeBps(
  baseFeeBps: number,
  maxFeeBps: number,
  newReserveIn: bigint,
  newReserveOut: bigint,
  oraclePriceIn: bigint,
  oraclePriceOut: bigint,
  depegThresholdBps: number,
): Promise<number> {
  const [value] = await call((wasm, a, o) => wasm.sw_dynamic_fee(a, o), [
    BigInt(baseFeeBps), BigInt(maxFeeBps), newReserveIn, newReserveOut,
    oraclePriceIn, oraclePriceOut, BigInt(depegThresholdBps),
  ], 1)
  return Number(value!)
}

export async function wasmQuote(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  amp: bigint,
  baseFeeBps: number,
  maxFeeBps: number,
  oraclePriceIn: bigint,
  oraclePriceOut: bigint,
  depegThresholdBps: number,
): Promise<SwapQuote> {
  const [amountOut, feeAmount, fee] = await call((wasm, a, o) => wasm.sw_quote(a, o), [
    reserveIn, reserveOut, amountIn, amp, BigInt(baseFeeBps), BigInt(maxFeeBps),
    oraclePriceIn, oraclePriceOut, BigInt(depegThresholdBps),
  ], 3)
  return { amountOut, feeAmount, dynamicFeeBps: Number(fee) }
}

export async function wasmLpMintAmount(
  reserveABefore: bigint,
  reserveBBefore: bigint,
  reserveAAfter: bigint,
  reserveBAfter: bigint,
  lpSupply: bigint,
  amp: bigint,
): Promise<bigint> {
  const [value] = await call((wasm, a, o) => wasm.sw_lp_mint(a, o), [
    reserveABefore, reserveBBefore, reserveAAfter, reserveBAfter, lpSupply, amp,
  ], 1)
  return value!
}

export async function wasmWithdrawAmounts(
  reserves: readonly [bigint, bigint],
  lpAmount: bigint,
  adjustedSupply: bigint,
): Promise<[bigint, bigint]> {
  const [a, b] = await call((wasm, x, o) => wasm.sw_withdraw(x, o), [
    reserves[0], reserves[1], lpAmount, adjustedSupply,
  ], 2)
  return [a!, b!]
}

export async function wasmPegDeltaBps(price: bigint): Promise<bigint> {
  const [value] = await call((wasm, a, o) => wasm.sw_peg_delta(a, o), [price], 1)
  return value!
}

export async function wasmCheckDepeg(
  priceA: bigint,
  priceB: bigint,
  maxDeviationBps: number,
): Promise<boolean> {
  const [value] = await call((wasm, a, o) => wasm.sw_check_depeg(a, o), [
    priceA, priceB, BigInt(maxDeviationBps),
  ], 1)
  return value !== 0n
}

export async function wasmEvaluateExpression(
  expression: string,
  variables: Record<string, bigint> = {},
): Promise<bigint> {
  const wasm = ensure(await initStableSwapWasm())
  const expr = new TextEncoder().encode(expression)
  if (expr.length > MAX_BUFFER) throw new Error('Expression too long for WASM module')
  const vars = encodeVariables(variables)
  new Uint8Array(wasm.memory.buffer, wasm.sw_expr_ptr(), MAX_BUFFER).fill(0)
  new Uint8Array(wasm.memory.buffer, wasm.sw_expr_ptr(), expr.length).set(expr)
  if (vars.length > 0) {
    new Uint8Array(wasm.memory.buffer, wasm.sw_vars_ptr(), vars.length).set(vars)
  }
  const code = wasm.sw_eval(
    wasm.sw_expr_ptr(), expr.length,
    wasm.sw_vars_ptr(), vars.length,
    wasm.sw_out_ptr(),
  )
  check(code)
  return readSlot(new DataView(wasm.memory.buffer), wasm.sw_out_ptr(), true)
}

/** WASM result with a TypeScript fallback for environments that cannot load it. */
export async function quoteWithWasmFallback(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  amp: bigint,
  baseFeeBps: number,
  maxFeeBps: number,
  oraclePriceIn: bigint,
  oraclePriceOut: bigint,
  depegThresholdBps: number,
): Promise<{ quote: SwapQuote; engine: 'wasm' | 'typescript' }> {
  if (await isStableSwapWasmReady()) {
    return {
      quote: await wasmQuote(reserveIn, reserveOut, amountIn, amp, baseFeeBps, maxFeeBps,
        oraclePriceIn, oraclePriceOut, depegThresholdBps),
      engine: 'wasm',
    }
  }
  return {
    quote: calculateSwapOutput(reserveIn, reserveOut, amountIn, amp, baseFeeBps, maxFeeBps,
      oraclePriceIn, oraclePriceOut, depegThresholdBps),
    engine: 'typescript',
  }
}

/** Compare a WASM quote with the TypeScript mirror; throws on any mismatch. */
export async function assertWasmParity(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  amp: bigint,
  baseFeeBps: number,
  maxFeeBps: number,
  oraclePriceIn: bigint,
  oraclePriceOut: bigint,
  depegThresholdBps: number,
): Promise<void> {
  const expected = calculateSwapOutput(reserveIn, reserveOut, amountIn, amp, baseFeeBps,
    maxFeeBps, oraclePriceIn, oraclePriceOut, depegThresholdBps)
  const actual = await wasmQuote(reserveIn, reserveOut, amountIn, amp, baseFeeBps, maxFeeBps,
    oraclePriceIn, oraclePriceOut, depegThresholdBps)
  if (expected.amountOut !== actual.amountOut ||
      expected.feeAmount !== actual.feeAmount ||
      expected.dynamicFeeBps !== actual.dynamicFeeBps) {
    throw new Error('WASM and TypeScript quotes differ')
  }
}

/** TypeScript helpers used by the fallback path. */
export const stableSwapFallback = {
  computeD,
  computeY,
  calculateDynamicFeeBps,
  calculateSwapOutput,
  calculateLpMintAmount,
  calculateWithdrawAmounts,
  calculatePegDeltaBps,
  checkDepeg,
  evaluateExpression,
}
