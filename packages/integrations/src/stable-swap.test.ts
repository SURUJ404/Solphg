import { describe, expect, it } from 'vitest'
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

describe('StableSwap invariant', () => {
  it('keeps D near the sum of reserves for a balanced pool', () => {
    const reserve = 1_000_000_000n
    const d = computeD(reserve, reserve, 100n)
    expect(d).toBeGreaterThan(1_900_000_000n)
    expect(d).toBeLessThan(2_100_000_000n)
  })

  it('rejects an empty pool', () => {
    expect(() => computeD(0n, 1_000n, 100n)).toThrow(/Pool is empty/)
  })

  it('preserves D across a swap-sized change in reserves', () => {
    const reserve = 1_000_000_000_000n
    const amp = 100n
    const before = computeD(reserve, reserve, amp)
    const after = computeD(reserve + 1_000_000n, computeY(reserve + 1_000_000n, before, amp), amp)
    expect(after).toBeGreaterThanOrEqual(before - 2n)
    expect(after).toBeLessThanOrEqual(before + 2n)
  })
})

describe('calculateSwapOutput', () => {
  it('quotes near 1:1 for a small trade in a large balanced pool', () => {
    const reserve = 1_000_000_000_000n
    const amountIn = 1_000_000n
    const quote = calculateSwapOutput(reserve, reserve, amountIn, 100n, 4, 100, PRICE, PRICE, 500)
    expect(quote.amountOut).toBeGreaterThan(990_000n)
    expect(quote.amountOut).toBeLessThanOrEqual(amountIn)
    expect(quote.dynamicFeeBps).toBe(4)
  })

  it('keeps slippage low for a 10% trade but raises the dynamic fee', () => {
    const reserve = 1_000_000_000_000n
    const amountIn = 100_000_000_000n
    const quote = calculateSwapOutput(reserve, reserve, amountIn, 100n, 4, 100, PRICE, PRICE, 500)
    expect((quote.amountOut * 100n) / amountIn).toBeGreaterThanOrEqual(98n)
    expect(quote.dynamicFeeBps).toBeGreaterThan(4)
  })

  it('rejects a zero input', () => {
    expect(() => calculateSwapOutput(1_000n, 1_000n, 0n, 100n, 4, 100, PRICE, PRICE, 500))
      .toThrow(/Zero amount/)
  })
})

describe('calculateDynamicFeeBps', () => {
  it('stays at the base fee when balanced and rises when imbalanced', () => {
    const balanced = calculateDynamicFeeBps(4, 100, 1_000_000n, 1_000_000n, PRICE, PRICE, 500)
    const imbalanced = calculateDynamicFeeBps(4, 100, 1_400_000n, 600_000n, PRICE, PRICE, 500)
    expect(balanced).toBe(4)
    expect(imbalanced).toBeGreaterThan(balanced)
  })

  it('rejects an inconsistent fee schedule', () => {
    expect(() => calculateDynamicFeeBps(100, 4, 1n, 1n, PRICE, PRICE, 500))
      .toThrow(/Invalid fee configuration/)
  })
})

describe('liquidity accounting', () => {
  it('locks minimum liquidity on the first deposit', () => {
    const amount = 1_000_000_000n
    const lp = calculateLpMintAmount(0n, 0n, amount, amount, 0n, 100n)
    expect(lp).toBeGreaterThan(1_999_000_000n)
  })

  it('scales later deposits with the change in D', () => {
    const reserve = 1_000_000_000n
    const lp = calculateLpMintAmount(
      reserve, reserve, reserve * 2n, reserve * 2n, 2_000_000_000n, 100n,
    )
    expect(lp).toBeGreaterThan(1_900_000_000n)
    expect(lp).toBeLessThan(2_100_000_000n)
  })

  it('burns LP tokens for proportional amounts of both tokens', () => {
    expect(calculateWithdrawAmounts([1_000_000n, 1_000_000n], 100_000n, 1_000_000n))
      .toEqual([100_000n, 100_000n])
  })

  it('rejects a dust burn that would round to a one-sided exit', () => {
    expect(() => calculateWithdrawAmounts([1n, 1_000_000n], 1n, 1_000_000n))
      .toThrow(/Single-sided withdrawals/)
  })
})

describe('oracle helpers', () => {
  it('reports peg deviation in basis points', () => {
    expect(calculatePegDeltaBps(PRICE)).toBe(0n)
    expect(calculatePegDeltaBps(980_000_000n)).toBe(200n)
  })

  it('flags prices outside the configured band', () => {
    expect(checkDepeg(PRICE, 999_000_000n, 200)).toBe(false)
    expect(checkDepeg(970_000_000n, PRICE, 200)).toBe(true)
    expect(checkDepeg(PRICE, 1_030_000_000n, 200)).toBe(true)
  })
})

describe('evaluateExpression', () => {
  it('respects arithmetic precedence and parentheses', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14n)
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20n)
    expect(evaluateExpression('10 - 3 - 2')).toBe(5n)
  })

  it('uses caller-supplied bigint variables', () => {
    expect(evaluateExpression('reserveA * amountIn / (reserveA + reserveB)', {
      reserveA: 1_000_000n,
      reserveB: 1_000_000n,
      amountIn: 10n,
    })).toBe(5n)
  })

  it('supports unary minus and remainder', () => {
    expect(evaluateExpression('-5 + 2')).toBe(-3n)
    expect(evaluateExpression('17 % 5')).toBe(2n)
  })

  it('rejects unknown variables, bad division, and malformed input', () => {
    expect(() => evaluateExpression('unknown + 1')).toThrow(/Unknown variable/)
    expect(() => evaluateExpression('1 / 0')).toThrow(/Division by zero/)
    expect(() => evaluateExpression('1 +')).toThrow(/Unexpected end/)
    expect(() => evaluateExpression('(1 + 2')).toThrow(/Unexpected end/)
  })

  it('cannot execute code or access properties', () => {
    expect(() => evaluateExpression('process.exit(1)')).toThrow()
    expect(() => evaluateExpression('x.constructor')).toThrow(/Invalid character/)
    expect(() => evaluateExpression('a'.repeat(1_001))).toThrow(/too long/)
  })
})
