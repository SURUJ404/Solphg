import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  assertWasmParity,
  initStableSwapWasm,
  isStableSwapWasmReady,
  wasmCheckDepeg,
  wasmComputeD,
  wasmComputeY,
  wasmDynamicFeeBps,
  wasmEvaluateExpression,
  wasmLpMintAmount,
  wasmPegDeltaBps,
  wasmQuote,
  wasmWithdrawAmounts,
} from './stable-swap-wasm'
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
} from './stable-swap'

const PRICE = 1_000_000_000n
const wasmPath = new URL('../assets/stable_swap.wasm', import.meta.url)

beforeAll(async () => {
  const bytes = await readFile(wasmPath)
  expect(await initStableSwapWasm(bytes)).not.toBeNull()
})

describe('WASM module loading', () => {
  it('is ready after initialization', async () => {
    expect(await isStableSwapWasmReady()).toBe(true)
  })
})

describe('WASM/TypeScript math parity', () => {
  it('computes the same invariant D', async () => {
    for (const [a, b, amp] of [
      [1_000_000n, 1_000_000n, 100n],
      [1_000_000_000_000n, 900_000_000_000n, 200n],
      [1_000_000n, 2_000_000n, 10n],
    ]) {
      expect(await wasmComputeD(a, b, amp)).toBe(computeD(a, b, amp))
    }
  })

  it('solves the same output reserve Y', async () => {
    const reserves = 1_000_000_000_000n
    const d = computeD(reserves, reserves, 100n)
    const next = reserves + 1_000_000n
    expect(await wasmComputeY(next, d, 100n)).toBe(computeY(next, d, 100n))
  })

  it('quotes swaps identically across balanced and imbalanced pools', async () => {
    for (const amountIn of [1_000_000n, 50_000_000_000n, 200_000_000_000n]) {
      await assertWasmParity(1_000_000_000_000n, 1_000_000_000_000n, amountIn,
        100n, 4, 100, PRICE, PRICE, 500)
      await assertWasmParity(1_000_000_000_000n, 800_000_000_000n, amountIn,
        100n, 4, 100, PRICE, 980_000_000n, 500)
    }
  })

  it('returns the same dynamic fee', async () => {
    expect(await wasmDynamicFeeBps(4, 100, 1_400_000n, 600_000n, PRICE, PRICE, 500))
      .toBe(calculateDynamicFeeBps(4, 100, 1_400_000n, 600_000n, PRICE, PRICE, 500))
  })

  it('mints and withdraws the same LP amounts', async () => {
    const reserve = 1_000_000_000n
    expect(await wasmLpMintAmount(0n, 0n, reserve, reserve, 0n, 100n))
      .toBe(calculateLpMintAmount(0n, 0n, reserve, reserve, 0n, 100n))
    expect(await wasmWithdrawAmounts([reserve, reserve], 1_000_000n, 2_000_000_000n))
      .toEqual(calculateWithdrawAmounts([reserve, reserve], 1_000_000n, 2_000_000_000n))
  })

  it('reports the same oracle deviation and depeg decision', async () => {
    expect(await wasmPegDeltaBps(980_000_000n)).toBe(calculatePegDeltaBps(980_000_000n))
    expect(await wasmCheckDepeg(970_000_000n, PRICE, 200))
      .toBe(checkDepeg(970_000_000n, PRICE, 200))
    expect(await wasmCheckDepeg(PRICE, 999_000_000n, 200))
      .toBe(checkDepeg(PRICE, 999_000_000n, 200))
  })
})

describe('WASM expression evaluator', () => {
  it('matches the TypeScript evaluator for variables and precedence', async () => {
    const variables = { reserveA: 1_000_000n, reserveB: 1_000_000n, amountIn: 10n }
    for (const expression of [
      '2 + 3 * 4',
      '(reserveA + reserveB) / amountIn',
      '-5 + 2',
      '17 % 5',
    ]) {
      expect(await wasmEvaluateExpression(expression, variables))
        .toBe(evaluateExpression(expression, variables))
    }
  })

  it('returns errors instead of executing unsafe input', async () => {
    await expect(wasmEvaluateExpression('process.exit(1)')).rejects.toThrow(/Invalid expression/)
    await expect(wasmEvaluateExpression('1 / 0')).rejects.toThrow(/Division by zero/)
    await expect(wasmEvaluateExpression('unknown')).rejects.toThrow(/Invalid expression/)
  })

  it('maps WASM error codes to readable messages', async () => {
    await expect(wasmComputeD(0n, 1_000n, 100n)).rejects.toThrow(/Invalid input/)
    await expect(wasmQuote(1_000n, 1_000n, 0n, 100n, 4, 100, PRICE, PRICE, 500))
      .rejects.toThrow(/Invalid input/)
  })
})

describe('WASM quote wrapper', () => {
  it('exposes a quote identical to the TypeScript helper', async () => {
    const quote = await wasmQuote(1_000_000_000_000n, 1_000_000_000_000n, 1_000_000n,
      100n, 4, 100, PRICE, PRICE, 500)
    expect(quote).toEqual(calculateSwapOutput(1_000_000_000_000n, 1_000_000_000_000n,
      1_000_000n, 100n, 4, 100, PRICE, PRICE, 500))
  })
})
