import { PublicKey } from '@solana/web3.js'
import type { IdlSeed } from '@solshift/core'

export function findProgramAddress(seeds: Buffer[], programId: PublicKey): { address: PublicKey; bump: number } {
  return PublicKey.findProgramAddressSync(seeds, programId)
}

export function derivePda(
  seeds: IdlSeed[],
  programId: PublicKey,
  resolver: (path: string) => PublicKey | Buffer
): { address: PublicKey; bump: number } {
  const seedBuffers: Buffer[] = seeds.map(seed => {
    if (seed.kind === 'const') return Buffer.from(seed.value)
    const resolved = resolver(seed.path)
    if (resolved instanceof PublicKey) return resolved.toBuffer()
    return Buffer.from(resolved)
  })
  return findProgramAddress(seedBuffers, programId)
}
