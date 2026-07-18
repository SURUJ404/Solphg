export const SOLPG_DEFAULT_ENDPOINT = 'https://api.devnet.solana.com'

export const SOLPG_WS_ENDPOINT = 'wss://api.devnet.solana.com/'

export const SOLPG_FAUCET_URL = 'https://faucet.solana.com'

export const COMPILER_API_URL = 'https://agile-sparkle-production-83d3.up.railway.app'

export interface ClusterConfig {
  name: string
  label: string
  rpcUrl: string
  wsUrl: string
  explorerTx: string
  explorerAccount: string
  isDefault?: boolean
}

export const CLUSTERS: ClusterConfig[] = [
  {
    name: 'devnet',
    label: 'Devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    wsUrl: 'wss://api.devnet.solana.com/',
    explorerTx: 'https://explorer.solana.com/tx/{sig}?cluster=devnet',
    explorerAccount: 'https://explorer.solana.com/address/{addr}?cluster=devnet',
    isDefault: true,
  },
  {
    name: 'testnet',
    label: 'Testnet',
    rpcUrl: 'https://api.testnet.solana.com',
    wsUrl: 'wss://api.testnet.solana.com/',
    explorerTx: 'https://explorer.solana.com/tx/{sig}?cluster=testnet',
    explorerAccount: 'https://explorer.solana.com/address/{addr}?cluster=testnet',
  },
  {
    name: 'mainnet-beta',
    label: 'Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    wsUrl: 'wss://api.mainnet-beta.solana.com/',
    explorerTx: 'https://explorer.solana.com/tx/{sig}',
    explorerAccount: 'https://explorer.solana.com/address/{addr}',
  },
]

export function getCluster(name?: string): ClusterConfig {
  return CLUSTERS.find(c => c.name === name) || CLUSTERS.find(c => c.isDefault) || CLUSTERS[0]
}

export const SBF_LOADER_PROGRAM_ID = 'BPFLoaderUpgradeab1e11111111111111111111111'

export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'

export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'

export const ANCHOR_DISCRIMINATOR_SIZE = 8

export const COMMANDS = [
  'solana airdrop',
  'solana balance',
  'solana confirm',
  'solana config',
  'solana deploy',
  'solana address',
  'anchor build',
  'anchor test',
  'anchor deploy',
] as const
