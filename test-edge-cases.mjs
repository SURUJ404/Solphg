import assert from 'node:assert'
import { describe, it } from 'node:test'

// --- Mocks ---
const store = {}
const sessionStore = {}
globalThis.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: k => { delete store[k] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) },
}
globalThis.sessionStorage = {
  getItem: k => sessionStore[k] ?? null,
  setItem: (k, v) => { sessionStore[k] = String(v) },
  removeItem: k => { delete sessionStore[k] },
  clear: () => { Object.keys(sessionStore).forEach(k => delete sessionStore[k]) },
}
if (!globalThis.crypto) globalThis.crypto = {}
if (!globalThis.crypto.getRandomValues) {
  // Deterministic key for reproducible tests
  let callCount = 0
  globalThis.crypto.getRandomValues = (arr) => {
    for (let i = 0; i < arr.length; i++) arr[i] = (i + callCount) & 0xFF
    callCount++
    return arr
  }
}
if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = () => '00000000-0000-0000-0000-000000000000'

globalThis.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : {}
  if (url.includes('/api/health'))
    return Response.json({ status: 'ok', activeBuilds: 0, maxConcurrentBuilds: 2 })
  if (url.includes('/api/build')) {
    if (body.programName === 'fail-build')
      return Response.json({ success: false, logs: 'compiler error', error: 'mock failure' })
    return Response.json({
      success: true, logs: 'Built', program: 'AAAA',
      idl: { version: '0.1.0', name: 'test', instructions: [], accounts: [], types: [], errors: [] },
      programId: '11111111111111111111111111111111',
    })
  }
  if (url.includes('/api/airdrop'))
    return Response.json({ signature: 'mock-sig' })
  if (url.includes('/api/balance'))
    return Response.json({ balance: 5.5 })
  return Response.json({ error: 'not found' }, { status: 404 })
}

const CORE = './packages/core/dist'
const ENGINE = './packages/engine/dist'
const SHELL = './packages/shell/dist'
const PM = './packages/plugin-manager/dist'
const INTEGRATIONS = './packages/integrations/dist'

// --- Core: wallet ---
describe('Core - wallet', async () => {
  sessionStorage.clear()
  localStorage.clear()
  const { loadWallet, saveWallet, clearWallet } = await import(`${CORE}/wallet.js`)

  it('returns null when empty', () => {
    assert.strictEqual(loadWallet(), null)
  })

  it('saves and loads', () => {
    const w = { publicKey: 'abc', secretKey: 'def', connected: true }
    saveWallet(w)
    assert.deepStrictEqual(loadWallet(), w)
    clearWallet()
    assert.strictEqual(loadWallet(), null)
  })

  it('stores encrypted (not plaintext)', () => {
    const w = { publicKey: 'abc', secretKey: 'my-secret-key', connected: true }
    saveWallet(w)
    const raw = localStorage.getItem('solpg_wallet')
    assert.ok(raw, 'should be stored')
    assert.ok(!raw.includes('my-secret-key'), 'secret should not be plaintext')
    assert.strictEqual(loadWallet()?.secretKey, 'my-secret-key', 'decrypts correctly')
    clearWallet()
  })

  it('handles corrupted JSON', () => {
    localStorage.setItem('solpg_wallet', '{bad')
    assert.strictEqual(loadWallet(), null)
  })

  it('handles empty string', () => {
    localStorage.setItem('solpg_wallet', '')
    assert.strictEqual(loadWallet(), null)
  })
})

// --- Plugin Manager ---
describe('PluginManager', async () => {
  localStorage.clear()
  const { ProjectManager } = await import(`${PM}/project-manager.js`)
  const { ANCHOR_TEMPLATE, NATIVE_TEMPLATE } = await import(`${PM}/templates.js`)

  it('creates empty project', () => {
    const pm = new ProjectManager()
    const p = pm.create('test', 'anchor')
    assert.strictEqual(p.name, 'test')
    assert.strictEqual(p.framework, 'anchor')
    assert.strictEqual(p.files.length, 0)
  })

  it('creates from Anchor template', () => {
    const pm = new ProjectManager()
    const p = pm.createFromTemplate(ANCHOR_TEMPLATE)
    assert.strictEqual(p.name, 'anchor-project')
    assert.ok(p.files.some(f => f.name === 'lib.rs'))
    assert.ok(p.files.some(f => f.name === 'client.ts'))
    assert.ok(p.files.some(f => f.name === 'anchor.test.ts'))
  })

  it('creates from Native template', () => {
    const pm = new ProjectManager()
    const p = pm.createFromTemplate(NATIVE_TEMPLATE)
    assert.strictEqual(p.name, 'native-project')
    assert.ok(p.files.some(f => f.name === 'lib.rs'))
  })

  it('gets by id / returns undefined for missing', () => {
    const pm = new ProjectManager()
    const p = pm.create('x', 'anchor')
    assert.ok(pm.get(p.id))
    assert.strictEqual(pm.get('nope'), undefined)
  })

  it('returns all projects', () => {
    localStorage.removeItem('solpg_projects')
    const pm = new ProjectManager()
    pm.create('a', 'anchor')
    pm.create('b', 'native')
    assert.strictEqual(pm.getAll().length, 2)
  })

  it('updates file content', () => {
    const pm = new ProjectManager()
    const p = pm.createFromTemplate(ANCHOR_TEMPLATE)
    const lib = p.files.find(f => f.name === 'lib.rs')
    assert.ok(pm.updateFile(p.id, lib.path, 'new content'))
    assert.strictEqual(pm.get(p.id).files.find(f => f.name === 'lib.rs').content, 'new content')
  })

  it('returns false for bad update targets', () => {
    const pm = new ProjectManager()
    const p = pm.create('x', 'anchor')
    assert.strictEqual(pm.updateFile('bad-id', 'x.rs', 'x'), false)
    assert.strictEqual(pm.updateFile(p.id, 'no/file.rs', 'x'), false)
  })

  it('adds and removes files', () => {
    const pm = new ProjectManager()
    const p = pm.create('x', 'anchor')
    const f = { name: 't.rs', path: 't.rs', content: 'fn main(){}', language: 'rust' }
    assert.ok(pm.addFile(p.id, f))
    assert.strictEqual(pm.get(p.id).files.length, 1)
    assert.ok(pm.removeFile(p.id, 't.rs'))
    assert.strictEqual(pm.get(p.id).files.length, 0)
  })

  it('returns false for bad add/remove targets', () => {
    const pm = new ProjectManager()
    assert.strictEqual(pm.addFile('bad-id', {}), false)
    assert.strictEqual(pm.removeFile('bad-id', 'x'), false)
  })

  it('deletes project', () => {
    const pm = new ProjectManager()
    const p = pm.create('del', 'anchor')
    assert.ok(pm.delete(p.id))
    assert.strictEqual(pm.get(p.id), undefined)
    assert.strictEqual(pm.delete('bad-id'), false)
  })
})

// --- Engine ---
describe('CompilerClient', async () => {
  const { CompilerClient } = await import(`${ENGINE}/compiler-client.js`)

  it('returns success on build', async () => {
    const r = await new CompilerClient().build({ programName: 'ok', files: [{ path: 'l.rs', content: '' }] })
    assert.strictEqual(r.success, true)
    assert.ok(r.programId)
  })

  it('returns failure on error', async () => {
    const r = await new CompilerClient().build({ programName: 'fail-build', files: [{ path: 'l.rs', content: '' }] })
    assert.strictEqual(r.success, false)
    assert.strictEqual(r.error, 'mock failure')
  })

  it('returns health status', async () => {
    const h = await new CompilerClient().health()
    assert.strictEqual(h.status, 'ok')
    assert.strictEqual(h.activeBuilds, 0)
  })
})

// --- Shell ---
describe('TerminalEmulator', async () => {
  const { TerminalEmulator } = await import(`${SHELL}/terminal.js`)

  it('help shows available commands', async () => {
    const t = new TerminalEmulator({ build: async () => ({ success: true }), health: async () => ({}) })
    const lines = await t.execute('help')
    assert.strictEqual(lines[0].type, 'input')
    assert.strictEqual(lines[1].type, 'output')
    assert.ok(lines[1].content.includes('solana airdrop'))
    assert.ok(lines[1].content.includes('anchor build'))
  })

  it('clear empties lines', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    await t.execute('help')
    assert.ok(t.getLines().length > 0)
    const lines = await t.execute('clear')
    // clear returns empty output, internal lines are cleared, only input line returned
    assert.strictEqual(lines.length, 1)
    assert.strictEqual(lines[0].content, '$ clear')
  })

  it('unknown command shows error', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    const lines = await t.execute('bogus123')
    assert.strictEqual(lines[1].type, 'error')
    assert.ok(lines[1].content.includes('Unknown command'))
  })

  it('empty/whitespace input returns single line', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    assert.strictEqual((await t.execute('')).length, 1)
    assert.strictEqual((await t.execute('   ')).length, 1)
  })

  it('solana commands require wallet', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    let lines = await t.execute('solana airdrop')
    assert.strictEqual(lines[1].type, 'error')
    assert.ok(lines[1].content.includes('Generate a wallet'))
  })

  it('solana address works with wallet', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    t.setWallet({ publicKey: 'pk-test-123', secretKey: 'sk', connected: true })
    const lines = await t.execute('solana address')
    assert.ok(lines[1].content.includes('pk-test-123'))
  })

  it('anchor build triggers callback', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    let called = false
    t.onBuild(() => { called = true; return Promise.resolve() })
    await t.execute('anchor build')
    assert.strictEqual(called, true)
  })

  it('anchor deploy triggers callback', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    let called = false
    t.onDeploy(() => { called = true; return Promise.resolve() })
    await t.execute('anchor deploy')
    assert.strictEqual(called, true)
  })

  it('setWallet/getWallet roundtrip', () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    t.setWallet({ publicKey: 'pk', secretKey: 'sk', connected: true })
    assert.strictEqual(t.getWallet().publicKey, 'pk')
    t.setWallet(null)
    assert.strictEqual(t.getWallet(), null)
  })

  it('rapid sequential commands', async () => {
    const t = new TerminalEmulator({ build: async () => ({}), health: async () => ({}) })
    await t.execute('help')
    await t.execute('help')
    await t.execute('help')
    assert.strictEqual(t.getLines().length, 6)
  })
})

// --- Integrations ---
describe('Integrations', async () => {
  describe('IDL client', async () => {
    const { generateClient } = await import(`${INTEGRATIONS}/idl-client.js`)

    it('generates class from IDL', () => {
      const code = generateClient({ version: '0.1.0', name: 'my_counter', instructions: [
        { name: 'increment', accounts: [], args: [] },
        { name: 'decrement', accounts: [], args: [{ name: 'amount', type: 'u64' }] },
      ], accounts: [], types: [], errors: [] })
      assert.ok(code.includes('My_counterClient'))
      assert.ok(code.includes('increment'))
      assert.ok(code.includes('args.amount'))
    })

    it('handles empty instructions', () => {
      const code = generateClient({ version: '0.1.0', name: 'empty', instructions: [], accounts: [], types: [], errors: [] })
      assert.ok(code.includes('class EmptyClient'))
    })
  })

  describe('serialization', async () => {
    const { serializeInstructionArgs } = await import(`${INTEGRATIONS}/serialize.js`)

    it('serializes u8', () => {
      const buf = serializeInstructionArgs([{ name: 'v', type: 'u8' }], { v: 42 })
      assert.strictEqual(buf[0], 42)
    })

    it('serializes u32', () => {
      const buf = serializeInstructionArgs([{ name: 'v', type: 'u32' }], { v: 999 })
      assert.strictEqual(buf.readUInt32LE(0), 999)
    })

    it('serializes string with length prefix', () => {
      const buf = serializeInstructionArgs([{ name: 's', type: 'string' }], { s: 'hi' })
      assert.strictEqual(buf.readUInt32LE(0), 2)
      assert.strictEqual(buf.slice(4).toString(), 'hi')
    })

    it('serializes bool', () => {
      assert.strictEqual(serializeInstructionArgs([{ name: 'b', type: 'bool' }], { b: true })[0], 1)
      assert.strictEqual(serializeInstructionArgs([{ name: 'b', type: 'bool' }], { b: false })[0], 0)
    })

    it('serializes option null', () => {
      const buf = serializeInstructionArgs([{ name: 'o', type: { option: 'u8' } }], { o: null })
      assert.strictEqual(buf[0], 0)
    })

    it('serializes option some', () => {
      const buf = serializeInstructionArgs([{ name: 'o', type: { option: 'u8' } }], { o: 7 })
      assert.strictEqual(buf[0], 1)
      assert.strictEqual(buf[1], 7)
    })

    it('serializes vec', () => {
      const buf = serializeInstructionArgs([{ name: 'v', type: { vec: 'u8' } }], { v: [10, 20] })
      assert.strictEqual(buf.readUInt32LE(0), 2)
      assert.strictEqual(buf[4], 10)
      assert.strictEqual(buf[5], 20)
    })

    it('serializes publicKey', () => {
      const key = new Uint8Array(32).fill(0xAB)
      const buf = serializeInstructionArgs([{ name: 'pk', type: 'publicKey' }], { pk: key })
      assert.strictEqual(buf.length, 32)
      assert.strictEqual(buf[0], 0xAB)
    })
  })
})
