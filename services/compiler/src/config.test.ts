import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const PROD_BASE: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CORS_ORIGIN: 'https://app.example.com',
  TRUST_PROXY_HOPS: '1',
  FAUCET_SECRET_KEY: 'a'.repeat(128),
}

const saved = { ...process.env }
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key]
  }
  Object.assign(process.env, saved)
})

function load(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({ ...PROD_BASE, ...overrides })
}

describe('loadConfig', () => {
  it('accepts a valid production configuration', () => {
    const cfg = load()
    expect(cfg.isProduction).toBe(true)
    expect(cfg.trustProxyHops).toBe(1)
    expect(cfg.corsOrigins).toEqual(['https://app.example.com'])
    expect(cfg.bodyLimit).toBe('8mb')
    expect(cfg.quotas.build).toBe(60)
    expect(cfg.quotas.deploy).toBe(10)
  })

  it('rejects production without CORS origins', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '1' })).toThrow(/CORS_ORIGIN/)
  })

  it('rejects wildcard and non-HTTPS origins', () => {
    expect(() => load({ CORS_ORIGIN: '*' })).toThrow(/wildcard/)
    expect(() => load({ CORS_ORIGIN: 'https://*.vercel.app' })).toThrow(/wildcard/)
    expect(() => load({ CORS_ORIGIN: 'http://localhost:3000' })).toThrow(/https/)
  })

  it('requires trust proxy hops in production', () => {
    expect(() => load({ TRUST_PROXY_HOPS: '0' })).toThrow(/TRUST_PROXY_HOPS/)
  })

  it('validates body limit', () => {
    expect(load({ BODY_LIMIT: '512kb' }).bodyLimit).toBe('512kb')
    expect(() => load({ BODY_LIMIT: '32mb' })).toThrow(/16mb/)
    expect(() => load({ BODY_LIMIT: 'garbage' })).toThrow(/BODY_LIMIT/)
  })

  it('validates integer env vars', () => {
    expect(() => load({ RATE_LIMIT_BUILD_MAX: 'abc' })).toThrow(/RATE_LIMIT_BUILD_MAX/)
    expect(() => load({ BUILD_QUOTA_MAX: '0' })).toThrow(/BUILD_QUOTA_MAX/)
    expect(() => load({ TRUST_PROXY_HOPS: '99' })).toThrow(/TRUST_PROXY_HOPS/)
  })

  it('validates RPC URLs and faucet secrets', () => {
    expect(() => load({ DEVNET_RPC_URL: 'http://insecure.example' })).toThrow(/https/)
    expect(() => load({ FAUCET_SECRET_KEY: 'abcd' })).toThrow(/128 hex/)
  })

  it('defaults trust proxy to 0 outside production', () => {
    const cfg = loadConfig({ NODE_ENV: 'development' })
    expect(cfg.trustProxyHops).toBe(0)
    expect(cfg.corsOrigins).toContain('http://localhost:5173')
  })
})
