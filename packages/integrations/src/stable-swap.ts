/**
 * Off-chain mirrors of the Stableswap pool math plus a small, safe expression
 * evaluator for quoting.
 *
 * These functions use bigint and integer division at the same points as the
 * on-chain Rust program, so a quote computed here should match a quote computed
 * by the program for the same inputs. Treat results as estimates: reserves,
 * fees and oracle prices can change before a transaction lands.
 */

export const STABLESWAP = {
  BASIS_POINTS: 10_000n,
  MINIMUM_LIQUIDITY: 1_000n,
  MAX_ITERATIONS: 255,
  ORACLE_PRICE_SCALE: 1_000_000_000n,
} as const

export interface SwapQuote {
  amountOut: bigint
  feeAmount: bigint
  dynamicFeeBps: number
}

const ZERO = 0n

/** Compute the StableSwap invariant D for two reserves (A > 0). */
export function computeD(reserveA: bigint, reserveB: bigint, amp: bigint): bigint {
  if (reserveA <= ZERO || reserveB <= ZERO) throw new Error('Pool is empty')
  if (amp <= ZERO) throw new Error('Invalid amplification')

  const sum = reserveA + reserveB
  const ann = amp * 4n
  let d = sum

  for (let i = 0; i < STABLESWAP.MAX_ITERATIONS; i++) {
    const previous = d
    // D_P = D³ / (4·x·y), accumulated with the same truncation points as Rust.
    const dp = (((d * d) / (reserveA * 2n)) * d) / (reserveB * 2n)
    const numerator = (ann * sum + dp * 2n) * d
    const denominator = (ann - 1n) * d + dp * 3n
    if (denominator <= ZERO) throw new Error('Math overflow in computeD')
    d = numerator / denominator
    if (abs(d - previous) <= 1n) return d
  }
  throw new Error('Convergence failed in Newton method')
}

/** Solve for the output reserve that preserves D after an input deposit. */
export function computeY(reserveOther: bigint, d: bigint, amp: bigint): bigint {
  if (reserveOther <= ZERO) throw new Error('Pool is empty')
  if (amp <= ZERO) throw new Error('Invalid amplification')

  const ann = amp * 4n
  const b = reserveOther + d / ann
  const c = (d * d * d) / (reserveOther * 4n * ann)
  let y = d

  for (let i = 0; i < STABLESWAP.MAX_ITERATIONS; i++) {
    const previous = y
    const numerator = y * y + c
    const denominator = 2n * y + b - d
    if (denominator <= ZERO) throw new Error('Math overflow in computeY')
    y = numerator / denominator
    if (abs(y - previous) <= 1n) return y
  }
  throw new Error('Convergence failed in Newton method')
}

/** Fee rises linearly from base to max as the post-trade state deviates from peg. */
export function calculateDynamicFeeBps(
  baseFeeBps: number,
  maxFeeBps: number,
  newReserveIn: bigint,
  newReserveOut: bigint,
  oraclePriceIn: bigint,
  oraclePriceOut: bigint,
  depegThresholdBps: number,
): number {
  if (baseFeeBps > maxFeeBps) throw new Error('Invalid fee configuration')
  if (depegThresholdBps <= 0) throw new Error('Invalid depeg threshold')
  if (oraclePriceOut <= ZERO) throw new Error('Invalid oracle price')

  const total = newReserveIn + newReserveOut
  const imbalanceBps = total === ZERO
    ? ZERO
    : (abs(newReserveIn - newReserveOut) * STABLESWAP.BASIS_POINTS) / total
  const ratioBps = (oraclePriceIn * STABLESWAP.BASIS_POINTS) / oraclePriceOut
  const deviationBps = abs(ratioBps - STABLESWAP.BASIS_POINTS)
  const stress = imbalanceBps > deviationBps ? imbalanceBps : deviationBps
  const cap = stress < BigInt(depegThresholdBps) ? stress : BigInt(depegThresholdBps)
  const range = BigInt(maxFeeBps - baseFeeBps)
  const fee = BigInt(baseFeeBps) + (range * cap) / BigInt(depegThresholdBps)
  return Number(fee > BigInt(maxFeeBps) ? BigInt(maxFeeBps) : fee)
}

/** Quote a swap using the same invariant and fee path as the on-chain program. */
export function calculateSwapOutput(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  amp: bigint,
  baseFeeBps: number,
  maxFeeBps: number,
  oraclePriceIn: bigint,
  oraclePriceOut: bigint,
  depegThresholdBps: number,
): SwapQuote {
  if (amountIn <= ZERO) throw new Error('Zero amount not allowed')

  const d = computeD(reserveIn, reserveOut, amp)
  const newReserveIn = reserveIn + amountIn
  const newReserveOut = computeY(newReserveIn, d, amp)
  const rawOut = reserveOut - newReserveOut
  if (rawOut <= ZERO) throw new Error('Insufficient liquidity in pool')

  const dynamicFeeBps = calculateDynamicFeeBps(
    baseFeeBps, maxFeeBps, newReserveIn, newReserveOut,
    oraclePriceIn, oraclePriceOut, depegThresholdBps,
  )
  const feeAmount = (rawOut * BigInt(dynamicFeeBps)) / STABLESWAP.BASIS_POINTS
  return { amountOut: rawOut - feeAmount, feeAmount, dynamicFeeBps }
}

/** LP tokens minted for a deposit. First deposit locks MINIMUM_LIQUIDITY. */
export function calculateLpMintAmount(
  reserveABefore: bigint,
  reserveBBefore: bigint,
  reserveAAfter: bigint,
  reserveBAfter: bigint,
  lpSupply: bigint,
  amp: bigint,
): bigint {
  if (lpSupply === ZERO) {
    const d = computeD(reserveAAfter, reserveBAfter, amp)
    if (d <= STABLESWAP.MINIMUM_LIQUIDITY) throw new Error('Initial liquidity too small')
    return d - STABLESWAP.MINIMUM_LIQUIDITY
  }
  const before = computeD(reserveABefore, reserveBBefore, amp)
  const after = computeD(reserveAAfter, reserveBAfter, amp)
  if (after < before) throw new Error('Insufficient liquidity in pool')
  return (lpSupply * (after - before)) / before
}

/** Proportional dual-sided amounts returned for an LP burn. */
export function calculateWithdrawAmounts(
  reserves: readonly [bigint, bigint],
  lpAmount: bigint,
  adjustedSupply: bigint,
): [bigint, bigint] {
  if (lpAmount <= ZERO) throw new Error('Zero amount not allowed')
  if (adjustedSupply <= ZERO) throw new Error('Pool is empty')
  if (reserves[0] <= ZERO || reserves[1] <= ZERO) throw new Error('Pool is empty')
  const a = (reserves[0] * lpAmount) / adjustedSupply
  const b = (reserves[1] * lpAmount) / adjustedSupply
  if (a <= ZERO || b <= ZERO) throw new Error('Single-sided withdrawals are not supported')
  return [a, b]
}

function abs(value: bigint): bigint {
  return value < ZERO ? -value : value
}

/** Deviation of a normalized oracle price from $1, in basis points. */
export function calculatePegDeltaBps(price: bigint): bigint {
  return (abs(price - STABLESWAP.ORACLE_PRICE_SCALE) * STABLESWAP.BASIS_POINTS)
    / STABLESWAP.ORACLE_PRICE_SCALE
}

/** True when either stablecoin is outside the configured peg band. */
export function checkDepeg(priceA: bigint, priceB: bigint, maxDeviationBps: number): boolean {
  const deviation = (STABLESWAP.ORACLE_PRICE_SCALE * BigInt(maxDeviationBps))
    / STABLESWAP.BASIS_POINTS
  const lower = STABLESWAP.ORACLE_PRICE_SCALE - deviation
  const upper = STABLESWAP.ORACLE_PRICE_SCALE + deviation
  return priceA < lower || priceA > upper || priceB < lower || priceB > upper
}

// ---------------------------------------------------------------------------
// Safe math-expression evaluator
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'number'; value: bigint }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }

const MAX_EXPRESSION_LENGTH = 1_000

function tokenize(expression: string): Token[] {
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new Error('Expression too long')
  const tokens: Token[] = []
  let i = 0
  while (i < expression.length) {
    const ch = expression[i]!
    if (/\s/.test(ch)) { i++; continue }
    if (ch >= '0' && ch <= '9') {
      let end = i
      while (end < expression.length && expression[end]! >= '0' && expression[end]! <= '9') end++
      tokens.push({ kind: 'number', value: BigInt(expression.slice(i, end)) })
      i = end
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let end = i
      while (end < expression.length && /[A-Za-z0-9_]/.test(expression[end]!)) end++
      tokens.push({ kind: 'name', value: expression.slice(i, end) })
      i = end
      continue
    }
    if ('+-*/%()'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch })
      i++
      continue
    }
    throw new Error(`Invalid character in expression: ${ch}`)
  }
  if (tokens.length === 0) throw new Error('Empty expression')
  return tokens
}

class ExpressionParser {
  private index = 0

  constructor(
    private readonly tokens: Token[],
    private readonly variables: Record<string, bigint>,
  ) {}

  parse(): bigint {
    const value = this.additive()
    if (this.index !== this.tokens.length) throw new Error('Unexpected token in expression')
    return value
  }

  private peek(op: string): boolean {
    const token = this.tokens[this.index]
    return !!token && token.kind === 'op' && token.value === op
  }

  private next(): Token {
    const token = this.tokens[this.index++]
    if (!token) throw new Error('Unexpected end of expression')
    return token
  }

  private additive(): bigint {
    let left = this.multiplicative()
    while (this.peek('+') || this.peek('-')) {
      const op = this.next()
      const right = this.multiplicative()
      left = op.value === '+' ? left + right : left - right
    }
    return left
  }

  private multiplicative(): bigint {
    let left = this.unary()
    while (this.peek('*') || this.peek('/') || this.peek('%')) {
      const op = this.next()
      const right = this.unary()
      if ((op.value === '/' || op.value === '%') && right === ZERO) {
        throw new Error('Division by zero')
      }
      left = op.value === '*' ? left * right : op.value === '/' ? left / right : left % right
    }
    return left
  }

  private unary(): bigint {
    if (this.peek('-')) { this.next(); return -this.unary() }
    if (this.peek('+')) { this.next(); return this.unary() }
    return this.primary()
  }

  private primary(): bigint {
    const token = this.next()
    if (token.kind === 'number') return token.value
    if (token.kind === 'name') {
      const value = this.variables[token.value]
      if (value === undefined) throw new Error(`Unknown variable: ${token.value}`)
      return value
    }
    if (token.kind === 'op' && token.value === '(') {
      const value = this.additive()
      const close = this.next()
      if (close.kind !== 'op' || close.value !== ')') throw new Error('Expected closing parenthesis')
      return value
    }
    throw new Error('Unexpected token in expression')
  }
}

/**
 * Evaluate a small arithmetic expression with caller-supplied bigint variables.
 * Supports + - * / % parentheses and unary +/-. It does NOT call `eval`,
 * execute functions, or access object properties, so untrusted expressions
 * cannot run code.
 */
export function evaluateExpression(
  expression: string,
  variables: Record<string, bigint> = {},
): bigint {
  return new ExpressionParser(tokenize(expression), variables).parse()
}
