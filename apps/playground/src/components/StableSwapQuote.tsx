import React, { useEffect, useState } from 'react'
import {
  isStableSwapWasmReady,
  quoteWithWasmFallback,
  wasmEvaluateExpression,
} from '@solshift/integrations/stable-swap-wasm'
import { evaluateExpression } from '@solshift/integrations/stable-swap'
import type { SwapQuote } from '@solshift/integrations/stable-swap'

const DEFAULTS = {
  reserveA: '1000000000000',
  reserveB: '1000000000000',
  amountIn: '1000000',
  amp: '100',
  baseFee: '4',
  maxFee: '100',
  oracleA: '1000000000',
  oracleB: '1000000000',
  depegThreshold: '500',
  expression: 'amountOut / 10000',
}

type Form = typeof DEFAULTS

const FIELDS: { key: keyof Form; label: string; hint?: string }[] = [
  { key: 'reserveA', label: 'Reserve A' },
  { key: 'reserveB', label: 'Reserve B' },
  { key: 'amountIn', label: 'Amount in' },
  { key: 'amp', label: 'Amplification', hint: 'A' },
  { key: 'baseFee', label: 'Base fee', hint: 'bps' },
  { key: 'maxFee', label: 'Max fee', hint: 'bps' },
  { key: 'oracleA', label: 'Oracle price A', hint: '1e9 scale' },
  { key: 'oracleB', label: 'Oracle price B', hint: '1e9 scale' },
  { key: 'depegThreshold', label: 'Depeg threshold', hint: 'bps' },
]

export function StableSwapQuote() {
  const [form, setForm] = useState<Form>(DEFAULTS)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [engine, setEngine] = useState<'wasm' | 'typescript' | null>(null)
  const [expressionResult, setExpressionResult] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [wasmReady, setWasmReady] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    isStableSwapWasmReady().then(ready => { if (mounted) setWasmReady(ready) })
    return () => { mounted = false }
  }, [])

  const calculate = async () => {
    setBusy(true)
    setError('')
    setQuote(null)
    setExpressionResult('')
    try {
      const amountOut = await quoteWithWasmFallback(
        BigInt(form.reserveA), BigInt(form.reserveB), BigInt(form.amountIn),
        BigInt(form.amp), Number(form.baseFee), Number(form.maxFee),
        BigInt(form.oracleA), BigInt(form.oracleB), Number(form.depegThreshold),
      )
      setQuote(amountOut.quote)
      setEngine(amountOut.engine)

      const variables = { amountOut: amountOut.quote.amountOut }
      const result = wasmReady
        ? await wasmEvaluateExpression(form.expression, variables)
        : evaluateExpression(form.expression, variables)
      setExpressionResult(result.toString())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="quote-panel">
      <p className="quote-intro">
        Off-chain StableSwap quote. The math module is compiled to WebAssembly and
        falls back to the TypeScript mirror if WASM cannot load.
      </p>
      <div className="quote-engine">
        Engine: {wasmReady === null ? 'checking…' : wasmReady ? 'WebAssembly' : 'TypeScript fallback'}
      </div>
      <div className="quote-grid">
        {FIELDS.map(field => (
          <label key={field.key} className="quote-field">
            <span>{field.label}{field.hint ? ` (${field.hint})` : ''}</span>
            <input
              value={form[field.key]}
              inputMode="numeric"
              onChange={event => setForm(prev => ({ ...prev, [field.key]: event.target.value }))}
            />
          </label>
        ))}
        <label className="quote-field quote-field-wide">
          <span>Expression (uses amountOut)</span>
          <input
            value={form.expression}
            onChange={event => setForm(prev => ({ ...prev, expression: event.target.value }))}
          />
        </label>
      </div>
      <button className="btn btn-primary quote-button" disabled={busy} onClick={() => void calculate()}>
        {busy ? 'Calculating…' : 'Calculate quote'}
      </button>
      {error && <div className="quote-error">{error}</div>}
      {quote && (
        <div className="quote-result">
          <div><span>Amount out</span><strong>{quote.amountOut.toString()}</strong></div>
          <div><span>Fee amount</span><strong>{quote.feeAmount.toString()}</strong></div>
          <div><span>Dynamic fee</span><strong>{quote.dynamicFeeBps} bps</strong></div>
          <div><span>Computed by</span><strong>{engine === 'wasm' ? 'WebAssembly' : 'TypeScript'}</strong></div>
          <div><span>Expression result</span><strong>{expressionResult}</strong></div>
        </div>
      )}
    </div>
  )
}
