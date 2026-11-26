# StableSwap AMM template

A two-token stablecoin swap pool available from **+ New from Template →
StableSwap AMM Pool** in the playground.

## Origin and license

Ported from [`SURUJ404/Solana`, `stableswap/anchor`](https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor).
The upstream program is MIT-licensed:

> MIT License
>
> Copyright (c) 2025 Solana Foundation
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## What changed in this port

- **Anchor 1.0.0-rc.2 → 0.31.1.** This project's compiler and builder image pin
  Anchor 0.31.1; the upstream program targets 1.0.0-rc.2. Account contexts,
  CPI helpers and error macros were adapted to 0.31.1.
- **No extra crates.** The compiler generates `Cargo.toml` with only
  `anchor-lang` and `anchor-spl` and builds with `CARGO_NET_OFFLINE=true`.
  `bytemuck` (used upstream for Pyth account parsing) is therefore replaced by
  a bounds-checked manual byte cursor. No Pyth SDK crate is used.
- **CPI fix.** Upstream passed a `&Pubkey` as the program account to
  `CpiContext::new`; Anchor 0.31 requires an `AccountInfo`, so the port passes
  `token_program.to_account_info()`.
- **Oracle overflow guard.** Upstream subtracted Pyth exponents with plain
  `i32` arithmetic, which can panic under SBF overflow checks for corrupt
  feeds. The port uses `checked_sub` and returns `InvalidOraclePrice` instead.

The StableSwap invariant, Newton iteration, checked arithmetic, fee ramp, LP
accounting and slippage guards are preserved.

## Instructions

| Instruction | Purpose |
|---|---|
| `initialize_pool` | Create the pool PDA, LP mint and two vault ATAs; store amplification, fee, depeg and oracle configuration. |
| `add_liquidity` | Deposit both tokens for LP shares; first deposit locks `MINIMUM_LIQUIDITY` dead shares. |
| `remove_liquidity` | Burn LP shares for a proportional share of both reserves. |
| `swap` | Trade one token for the other using the StableSwap invariant with dynamic fees. |
| `check_depeg` | Standalone oracle preflight using the same halt condition as swaps/deposits. |

Pool PDA: `["pool", lp_mint]`. Vaults are the canonical ATAs of that PDA, and
every instruction re-validates them before moving tokens.

## Important caveats

- **Oracle layout.** The parser accepts the *legacy v2 Pyth price account*
  layout used upstream (32 publisher slots, magic `0xa1b2c3d4`). Current Pyth
  feeds may use a newer layout, in which case initialization/swaps will reject
  the feed as an invalid oracle account. Verify against the exact feed you
  intend to use before funding a pool.
- **No deployment guarantees.** Building the template produces `.so` and an
  IDL; it does not deploy or verify the program on a cluster. No on-chain
  testing was performed for this port.
- **Financial risk.** AMMs handle real value. Review the math and account
  validation independently before using anything beyond a local playground.

## Client-side math and expressions

`packages/integrations/src/stable-swap.ts` mirrors the on-chain math with
`bigint` and the same integer-division points, so off-chain quotes match on-chain
quotes for identical inputs:

```ts
import { calculateSwapOutput, evaluateExpression } from '@solshift/integrations/stable-swap'

const quote = calculateSwapOutput(
  1_000_000_000_000n, 1_000_000_000_000n,  // reserves
  1_000_000n,                              // amount in
  100n,                                    // amplification
  4, 100,                                  // base / max fee (bps)
  1_000_000_000n, 1_000_000_000n,          // oracle prices
  500,                                     // depeg threshold (bps)
)

const feeBudget = evaluateExpression('amountOut / 10000', {
  amountOut: quote.amountOut,
})
```

`evaluateExpression` is a small recursive-descent parser supporting integers,
`+ - * / %`, parentheses and named bigint variables. It does **not** call
`eval`, execute functions, or access object properties, so untrusted
expressions cannot run code. Division by zero and unknown variables throw.

## WebAssembly client math

The same math is compiled to WebAssembly from `wasm/stable-swap` (dependency-free
Rust, `wasm32-unknown-unknown`) and exposed through:

```ts
import {
  initStableSwapWasm,
  quoteWithWasmFallback,
  wasmEvaluateExpression,
} from '@solshift/integrations/stable-swap-wasm'
```

`quoteWithWasmFallback` uses WASM when available and transparently falls back
to the TypeScript mirror. The playground's **StableSwap Quote** side panel uses
this path and reports which engine produced the result.

Rebuild the committed artifact whenever the Rust or TypeScript math changes:

```sh
rustup target add wasm32-unknown-unknown
npm run build:wasm
```

The build copies `stable_swap_wasm.wasm` to
`packages/integrations/assets/stable_swap.wasm`; Vite emits it as a hashed
production asset. Tests in `stable-swap-wasm.test.ts` assert parity between the
WASM and TypeScript implementations for invariants, quotes, fees, liquidity,
oracle helpers and expression evaluation.

Caveats:

- WASM uses fixed-width `u128` slots with checked arithmetic; the TypeScript
  mirror uses arbitrary-precision `bigint`. Results match for amounts that fit
  in 128 bits (all realistic token amounts); larger inputs return a clear
  overflow error from WASM.
- The module never grows linear memory and has no imports or filesystem/network
  access. Expression evaluation remains a hand-written parser, not `eval`.
