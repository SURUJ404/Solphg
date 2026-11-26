// Builds the dependency-free StableSwap client math into WebAssembly.
// Requires the `wasm32-unknown-unknown` rustup target (see docs/STABLESWAP.md).
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = path.join(root, 'wasm', 'stable-swap', 'Cargo.toml')
const built = path.join(
  root, 'wasm', 'stable-swap', 'target', 'wasm32-unknown-unknown',
  'release', 'stable_swap_wasm.wasm',
)
const asset = path.join(root, 'packages', 'integrations', 'assets', 'stable_swap.wasm')

const result = spawnSync(
  'cargo',
  ['build', '--manifest-path', manifest, '--target', 'wasm32-unknown-unknown', '--release'],
  { stdio: 'inherit', cwd: root },
)
if (result.status !== 0) {
  console.error(`cargo build failed with exit code ${result.status}`)
  process.exit(result.status ?? 1)
}

await mkdir(path.dirname(asset), { recursive: true })
await copyFile(built, asset)
console.log(`Wrote ${path.relative(root, asset)}`)
