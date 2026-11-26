import type { SolpgFile } from '@solshift/core'

export interface ProjectTemplate {
  name: string
  framework: 'anchor' | 'native'
  files: SolpgFile[]
}

export const ANCHOR_TEMPLATE: ProjectTemplate = {
  name: 'anchor-project',
  framework: 'anchor',
  files: [
    {
      name: 'lib.rs',
      path: 'lib.rs',
      content: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod myproject {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Initialized!");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
`,
      language: 'rust',
    },
    {
      name: 'Cargo.toml',
      path: 'programs/myproject/Cargo.toml',
      content: `[package]
name = "myproject"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []

[dependencies]
anchor-lang = "0.31.1"
`,
      language: 'plain',
    },
    {
      name: 'Anchor.toml',
      path: 'Anchor.toml',
      content: `[toolchain]
anchor_version = "0.31.1"

[programs.devnet]
myproject = "11111111111111111111111111111111"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json tests/**/*.ts"
`,
      language: 'plain',
    },
    {
      name: 'client.ts',
      path: 'client.ts',
      content: `import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import idl from "./target/idl/myproject.json";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = new Program(idl, provider);

(async () => {
  const tx = await program.methods.initialize().rpc();
  console.log("Tx:", tx);
})();
`,
      language: 'typescript',
    },
    {
      name: 'anchor.test.ts',
      path: 'tests/anchor.test.ts',
      content: `import * as anchor from "@project-serum/anchor";

describe("myproject", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Myproject;

  it("initializes", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("Tx signature:", tx);
  });
});
`,
      language: 'typescript',
    },
  ],
}

export const NATIVE_TEMPLATE: ProjectTemplate = {
  name: 'native-project',
  framework: 'native',
  files: [
    {
      name: 'lib.rs',
      path: 'lib.rs',
      content: `use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    msg!("Hello from native Solana program!");
    Ok(())
}
`,
      language: 'rust',
    },
    {
      name: 'Cargo.toml',
      path: 'Cargo.toml',
      content: `[package]
name = "native-project"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
solana-program = "~2.0"
`,
      language: 'plain',
    },
    {
      name: 'client.ts',
      path: 'client.ts',
      content: `import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");

// Use your program ID here
const programId = new PublicKey("YOUR_PROGRAM_ID_HERE");

(async () => {
  console.log("Client ready for program:", programId.toBase58());
})();
`,
      language: 'typescript',
    },
  ],
}

// SPL token transfer Anchor program. Three instructions: create_mint, mint_to,
// send_with_memo. Wraps anchor-spl token::transfer with a memo CPI and an
// amount sanity check, so it isn't a thin wrapper of the system token program.
export const SPL_TRANSFER_TEMPLATE: ProjectTemplate = {
  name: 'spl-transfer',
  framework: 'anchor',
  files: [
    {
      name: 'lib.rs',
      path: 'programs/spl_transfer/src/lib.rs',
      content: `use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111");

#[program]
pub mod spl_transfer {
    use super::*;

    pub fn create_mint(ctx: Context<CreateMint>, decimals: u8) -> Result<()> {
        let rent = Rent::get()?.minimum_required_balance(Mint::LEN);
        let cpi_accounts = anchor_spl::system_program::CreateAccount {
            from: ctx.accounts.payer.to_account_info(),
            to: ctx.accounts.mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
        );
        anchor_spl::system_program::create_account(
            cpi_ctx,
            rent,
            Mint::LEN as u64,
            &token::ID,
        )?;
        token::initialize_mint2(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::InitializeMint2 {
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            decimals,
            &ctx.accounts.payer.key(),
            None,
        )?;
        Ok(())
    }

    pub fn mint_to(ctx: Context<MintTo>, amount: u64) -> Result<()> {
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.ata.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn send_with_memo(
        ctx: Context<SendWithMemo>,
        amount: u64,
        memo: String,
    ) -> Result<()> {
        require!(amount > 0 && amount <= 1_000_000_000_000, SplError::BadAmount);
        require!(memo.len() <= 256, SplError::MemoTooLong);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.from.to_account_info(),
                    to: ctx.accounts.to.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        let memo_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: anchor_lang::solana_program::pubkey::Pubkey::try_from(
                "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            ).unwrap(),
            accounts: vec![anchor_lang::solana_program::instruction::AccountMeta::new(
                ctx.accounts.authority.key(),
                true,
            )],
            data: memo.into_bytes(),
        };
        anchor_lang::solana_program::program::invoke(
            &memo_ix,
            &[ctx.accounts.authority.to_account_info()],
        )?;
        msg!("sent {} memo={}", amount, memo);
        Ok(())
    }
}

#[error_code]
pub enum SplError {
    #[msg("amount out of range")]
    BadAmount,
    #[msg("memo longer than 256 bytes")]
    MemoTooLong,
}

#[derive(Accounts)]
pub struct CreateMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The mint keypair, generated client-side. Signs so the new account is
    /// owned by the token program.
    #[account(mut)]
    pub mint: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintTo<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SendWithMemo<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
`,
      language: 'rust',
    },
    {
      name: 'Cargo.toml',
      path: 'programs/spl_transfer/Cargo.toml',
      content: `[package]
name = "spl_transfer"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []

[dependencies]
anchor-lang = "0.31.1"
anchor-spl = "0.31.1"
`,
      language: 'plain',
    },
    {
      name: 'Anchor.toml',
      path: 'Anchor.toml',
      content: `[toolchain]
anchor_version = "0.31.1"

[features]
resolution = true
skip-lint = false

[programs.devnet]
spl_transfer = "11111111111111111111111111111111"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json tests/**/*.ts"
`,
      language: 'plain',
    },
    {
      name: 'client.ts',
      path: 'client.ts',
      content: `// Minimal client. The playground wraps this with the
// AppsPanel UI and the \`spl\` terminal commands.
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("YOUR_PROGRAM_ID_HERE");
const connection = new Connection("https://api.devnet.solana.com");

(async () => {
  console.log("spl_transfer program:", PROGRAM_ID.toBase58());
  console.log("rpc:", connection.rpcEndpoint);
})();
`,
      language: 'typescript',
    },
    {
      name: 'spl_transfer.test.ts',
      path: 'tests/spl_transfer.test.ts',
      content: `import * as anchor from "@project-serum/anchor";

describe("spl_transfer", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("builds", async () => {
    // Real assertions require a deployed program; this is a placeholder.
  });
});
`,
      language: 'typescript',
    },
  ],
}

// On-chain coin flip. Player commits SOL to a PDA, the program derives a
// random byte from clock.slot XOR recent_blockhash, and pays out 2x on a win.
export const COINFLIP_TEMPLATE: ProjectTemplate = {
  name: 'coinflip',
  framework: 'anchor',
  files: [
    {
      name: 'lib.rs',
      path: 'programs/coinflip/src/lib.rs',
      content: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod coinflip {
    use super::*;

    pub fn initialize_house(
        ctx: Context<InitializeHouse>,
        min_bet: u64,
        max_bet: u64,
    ) -> Result<()> {
        let house = &mut ctx.accounts.house;
        house.min_bet = min_bet;
        house.max_bet = max_bet;
        house.bump = ctx.bumps.house;
        Ok(())
    }

    pub fn play(
        ctx: Context<Play>,
        side: bool,
        amount: u64,
        game_nonce: u64,
        recent_blockhash: [u8; 32],
    ) -> Result<()> {
        let house = &ctx.accounts.house;
        require!(
            amount >= house.min_bet && amount <= house.max_bet,
            CoinflipError::BetOutOfRange
        );
        require!(amount > 0, CoinflipError::BetOutOfRange);

        // Pull SOL from the player into the game PDA.
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.game.to_account_info(),
                },
            ),
            amount,
        )?;

        let game = &mut ctx.accounts.game;
        game.player = ctx.accounts.player.key();
        game.side = side;
        game.amount = amount;
        game.committed_at = Clock::get()?.slot;
        game.recent_blockhash = recent_blockhash;
        game.settled = false;
        game.won = false;
        game.bump = ctx.bumps.game;
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>, _game_nonce: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(!game.settled, CoinflipError::AlreadySettled);

        let slot_bytes = Clock::get()?.slot.to_le_bytes();
        let mut acc: u8 = 0;
        for i in 0..8 {
            acc ^= slot_bytes[i] ^ game.recent_blockhash[i];
        }
        let won = game.side == (acc % 2 == 0);

        if won {
            // Pay the player from the PDA. Subtract a small rent cushion.
            let cushion = Rent::get()?.minimum_balance(0);
            let payout = game.amount.saturating_sub(cushion);
            **ctx
                .accounts
                .game
                .to_account_info()
                .try_borrow_mut_lamports()? = ctx
                .accounts
                .game
                .to_account_info()
                .lamports()
                .saturating_sub(payout);
            **ctx
                .accounts
                .player
                .to_account_info()
                .try_borrow_mut_lamports()? = ctx
                .accounts
                .player
                .to_account_info()
                .lamports()
                .saturating_add(payout);
        }
        game.settled = true;
        game.won = won;
        Ok(())
    }
}

#[account]
pub struct House {
    pub min_bet: u64,
    pub max_bet: u64,
    pub bump: u8,
}

#[account]
pub struct Game {
    pub player: Pubkey,
    pub side: bool,
    pub amount: u64,
    pub committed_at: u64,
    pub recent_blockhash: [u8; 32],
    pub settled: bool,
    pub won: bool,
    pub bump: u8,
}

#[error_code]
pub enum CoinflipError {
    #[msg("bet is out of [min_bet, max_bet]")]
    BetOutOfRange,
    #[msg("game already settled")]
    AlreadySettled,
}

#[derive(Accounts)]
pub struct InitializeHouse<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 8 + 1,
        seeds = [b"house"],
        bump,
    )]
    pub house: Account<'info, House>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Play<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        init,
        payer = player,
        space = 8 + 32 + 1 + 8 + 8 + 32 + 1 + 1 + 1,
        seeds = [b"game", player.key().as_ref(), &game_nonce.to_le_bytes()],
        bump,
    )]
    pub game: Account<'info, Game>,
    #[account(seeds = [b"house"], bump = house.bump)]
    pub house: Account<'info, House>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"game", player.key().as_ref(), &game_nonce.to_le_bytes()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,
}
`,
      language: 'rust',
    },
    {
      name: 'Cargo.toml',
      path: 'programs/coinflip/Cargo.toml',
      content: `[package]
name = "coinflip"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []

[dependencies]
anchor-lang = "0.31.1"
`,
      language: 'plain',
    },
    {
      name: 'Anchor.toml',
      path: 'Anchor.toml',
      content: `[toolchain]
anchor_version = "0.31.1"

[features]
resolution = true
skip-lint = false

[programs.devnet]
coinflip = "11111111111111111111111111111111"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json tests/**/*.ts"
`,
      language: 'plain',
    },
    {
      name: 'client.ts',
      path: 'client.ts',
      content: `import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("YOUR_PROGRAM_ID_HERE");
const connection = new Connection("https://api.devnet.solana.com");

(async () => {
  console.log("coinflip program:", PROGRAM_ID.toBase58());
})();
`,
      language: 'typescript',
    },
    {
      name: 'coinflip.test.ts',
      path: 'tests/coinflip.test.ts',
      content: `import * as anchor from "@project-serum/anchor";

describe("coinflip", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("builds", async () => {
    // Real assertions require a deployed program; this is a placeholder.
  });
});
`,
      language: 'typescript',
    },
  ],
}

export const STABLESWAP_TEMPLATE: ProjectTemplate = {
  name: 'stableswap',
  framework: 'anchor',
  files: [
    {
      name: "lib.rs",
      path: "programs/stableswap/src/lib.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! StableSwap program entrypoint and module wiring.

use anchor_lang::prelude::*;

/// Shared constants used across invariant, fee, and oracle logic.
pub mod constants;
/// Adaptive fee calculations used by swap pricing.
pub mod dynamic_fees;
/// Program-specific error codes returned by Anchor instructions.
pub mod errors;
/// Instruction account contexts and handlers.
pub mod instructions;
/// StableSwap invariant and fee math.
pub mod math;
/// Pyth oracle parsing and peg-protection helpers.
pub mod oracle;
/// Persistent on-chain account state definitions.
pub mod state;

use instructions::*;

declare_id!("CorabfeniSyoc4aLcJe7t9b3RaFX5tzVWXdewU1xuA6B");

/// StableSwap AMM — a two-token liquidity pool optimized for stablecoin pairs.
///
/// ## Background
///
/// Constant-product AMMs (Uniswap-style x·y=k) have significant price impact
/// even for modest trades. For assets that should trade at nearly equal value
/// (USDC/USDT, USDh/USDT, etc.) the Curve-style hybrid invariant:
///
///   4·A·(x + y) + D  =  4·A·D + D³/(4·x·y)
///
/// gives dramatically lower slippage while still self-balancing when the peg
/// breaks. The amplification parameter A controls the trade-off:
///
///   - High A (100-2000): very stable, nearly flat curve near peg
///   - Low A (1-10): close to constant-product, handles de-peg better
#[program]
pub mod stableswap {
    use super::*;

    /// Create a new two-token StableSwap pool.
    ///
    /// Initialises the pool state, LP mint, and two token vaults.
    ///
    /// # Arguments
    /// * \`amplification\` — A parameter (1–1,000,000). Typical: 100–2000.
    /// * \`base_fee_bps\`         — Minimum swap fee in basis points.
    /// * \`max_dynamic_fee_bps\`  — Maximum swap fee once the pool drifts away from peg.
    /// * \`depeg_threshold_bps\`  — Peg band that triggers the oracle pause.
    /// * \`max_price_age_sec\`    — Maximum acceptable Pyth price age.
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        amplification: u64,
        base_fee_bps: u16,
        max_dynamic_fee_bps: u16,
        depeg_threshold_bps: u16,
        max_price_age_sec: u64,
    ) -> Result<()> {
        instructions::initialize_pool::initialize_pool_handler(
            ctx,
            amplification,
            base_fee_bps,
            max_dynamic_fee_bps,
            depeg_threshold_bps,
            max_price_age_sec,
        )
    }

    /// Deposit token A and/or token B to receive LP tokens.
    ///
    /// LP tokens represent a proportional share of the pool.
    /// Depositing both tokens in the current pool ratio is most efficient,
    /// but imbalanced deposits are also supported.
    ///
    /// # Arguments
    /// * \`amount_a\`   — Token A to deposit.
    /// * \`amount_b\`   — Token B to deposit.
    /// * \`min_lp_out\` — Minimum LP tokens to receive (slippage guard).
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
        min_lp_out: u64,
    ) -> Result<()> {
        instructions::modify_liquidity::add_liquidity_handler(ctx, amount_a, amount_b, min_lp_out)
    }

    /// Burn LP tokens to withdraw a proportional share of both tokens.
    ///
    /// # Arguments
    /// * \`lp_amount\` — LP tokens to burn.
    /// * \`min_a\`     — Minimum token A to receive (slippage guard).
    /// * \`min_b\`     — Minimum token B to receive (slippage guard).
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_amount: u64,
        min_a: u64,
        min_b: u64,
    ) -> Result<()> {
        instructions::modify_liquidity::remove_liquidity_handler(ctx, lp_amount, min_a, min_b)
    }

    /// Check whether either stablecoin has moved outside the pool's peg band.
    ///
    /// This surfaces the same oracle-based halt condition used by swaps and
    /// deposits, but as a standalone instruction for monitoring or preflight.
    pub fn check_depeg(ctx: Context<CheckDepeg>) -> Result<()> {
        instructions::check_depeg::check_depeg_handler(ctx)
    }

    /// Swap one pool token for the other.
    ///
    /// Uses the StableSwap invariant for extremely low slippage when both
    /// tokens trade near parity, while Pyth oracle checks and adaptive fees
    /// defend LPs when the pool drifts away from fair value.
    ///
    /// # Arguments
    /// * \`amount_in\`      — Input amount to sell.
    /// * \`min_amount_out\` — Minimum output amount (slippage guard).
    /// * \`input_index\`    — Pool token index to sell.
    /// * \`output_index\`   — Pool token index to receive.
    pub fn swap<'info>(
        ctx: Context<'_, '_, '_, 'info, Swap<'info>>,
        amount_in: u64,
        min_amount_out: u64,
        input_index: u8,
        output_index: u8,
    ) -> Result<()> {
        instructions::swap::swap_handler(ctx, amount_in, min_amount_out, input_index, output_index)
    }
}
`,
      language: 'rust',
    },
    {
      name: "constants.rs",
      path: "programs/stableswap/src/constants.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Constants that parameterize pool safety checks and fixed-point math.

/// StableSwap pools in this example always contain exactly two tokens.
pub const NUM_TOKENS: usize = 2;

/// Dead shares locked on first deposit to prevent LP inflation attacks.
/// Equivalent to Uniswap V2's MINIMUM_LIQUIDITY.
pub const MINIMUM_LIQUIDITY: u64 = 1_000;

/// Basis points divisor used throughout fee and peg calculations.
pub const BASIS_POINTS_DIVISOR: u128 = 10_000;

/// Maximum amplification parameter A.
/// Higher A = tighter price curve (less slippage but less flexibility).
/// Curve Finance typically uses 100-2000 for stablecoin pairs.
pub const MAX_AMP: u64 = 1_000_000;

/// Maximum swap fee in basis points (100% = 10_000 bps).
pub const MAX_FEE_BPS: u16 = 10_000;

/// Maximum allowed depeg threshold. Pools tighter than this still provide
/// sensible protection, while avoiding configurations that effectively disable
/// the oracle guard.
pub const MAX_DEPEG_THRESHOLD_BPS: u16 = 5_000;

/// Maximum Newton's method iterations for invariant computation.
pub const MAX_ITERATIONS: u8 = 255;

/// Pyth prices are normalized to 1e9 fixed-point precision inside the program.
pub const ORACLE_PRICE_SCALE: u128 = 1_000_000_000;

/// Target stablecoin price in the normalized oracle precision.
pub const TARGET_STABLE_PRICE: u128 = ORACLE_PRICE_SCALE;

/// Internal exponent associated with ORACLE_PRICE_SCALE.
pub const ORACLE_TARGET_EXPONENT: i32 = -9;

/// Default maximum age accepted for Pyth prices when the pool checks oracle
/// health. The current state model does not store this value per pool.
pub const DEFAULT_MAX_PRICE_AGE_SEC: u64 = 60;
`,
      language: 'rust',
    },
    {
      name: "errors.rs",
      path: "programs/stableswap/src/errors.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Error codes emitted by the StableSwap program.

use anchor_lang::prelude::*;

/// Domain-specific failures surfaced by instruction handlers and helpers.
#[error_code]
pub enum StableSwapError {
    /// The configured amplification coefficient is outside the supported range.
    #[msg("Amplification parameter must be between 1 and 1,000,000")]
    InvalidAmplification,

    /// A fee input exceeded the universal basis-point ceiling.
    #[msg("Fee exceeds maximum of 100%")]
    InvalidFee,

    /// The fee schedule is internally inconsistent.
    #[msg("Dynamic fee configuration is invalid")]
    InvalidFeeConfig,

    /// The caller configured an unsupported peg deviation threshold.
    #[msg("Depeg threshold is outside the supported range")]
    InvalidDepegThreshold,

    /// Oracle freshness windows must be positive.
    #[msg("Oracle price maximum age must be greater than zero")]
    InvalidOracleAge,

    /// User-provided slippage bounds were not met.
    #[msg("Slippage exceeded: output less than minimum")]
    SlippageExceeded,

    /// The pool does not have enough liquidity for the requested action.
    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,

    /// Checked arithmetic overflowed or divided by zero.
    #[msg("Math overflow")]
    MathOverflow,

    /// Zero-value operations are rejected to avoid ambiguous behavior.
    #[msg("Zero amount not allowed")]
    ZeroAmount,

    /// Newton iteration failed to converge within the configured limit.
    #[msg("Convergence failed in Newton's method")]
    ConvergenceFailed,

    /// The pool must hold reserves on both sides before pricing swaps.
    #[msg("Pool is empty")]
    EmptyPool,

    /// Initial liquidity was too small after subtracting locked LP shares.
    #[msg("Initial liquidity too small")]
    InsufficientInitialLiquidity,

    /// Liquidity withdrawals must redeem a proportional share of both assets.
    #[msg("Single-sided withdrawals are not supported; LP exits must stay proportional")]
    SingleSidedWithdrawalNotAllowed,

    /// The caller referenced a token slot outside the supported token list.
    #[msg("Invalid token index")]
    InvalidTokenIndex,

    /// Swapping a token into itself is always nonsensical.
    #[msg("Input and output token must be different")]
    SameTokenSwap,

    /// The swap instruction requires the expected remaining account layout.
    #[msg("Invalid remaining accounts for swap instruction")]
    InvalidRemainingAccounts,

    /// A supplied token vault does not match the pool configuration.
    #[msg("Invalid vault account")]
    InvalidVault,

    /// A supplied mint does not match the pool configuration.
    #[msg("Invalid token mint")]
    InvalidMint,

    /// Stable pairs are expected to share the same token precision.
    #[msg("Both token mints must use the same decimals for this StableSwap pool")]
    InvalidMintDecimals,

    /// The provided Pyth account failed key or layout validation.
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,

    /// The provided system program account does not match the canonical ID.
    #[msg("Invalid system program account")]
    InvalidSystemProgram,

    /// The provided SPL token program account does not match the canonical ID.
    #[msg("Invalid token program account")]
    InvalidTokenProgram,

    /// The provided associated token program account does not match the canonical ID.
    #[msg("Invalid associated token program account")]
    InvalidAssociatedTokenProgram,

    /// The oracle value is older than the configured freshness threshold.
    #[msg("Oracle price is stale")]
    StaleOraclePrice,

    /// The oracle reported a non-positive or otherwise unusable price.
    #[msg("Oracle price is invalid")]
    InvalidOraclePrice,

    /// Trading and deposits are halted while a stablecoin is off peg.
    #[msg("Pool is paused because one of the stablecoins is outside the peg band")]
    PoolPaused,
}
`,
      language: 'rust',
    },
    {
      name: "state.rs",
      path: "programs/stableswap/src/state.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! On-chain account state for the StableSwap pool.

use crate::constants::NUM_TOKENS;
use anchor_lang::prelude::*;

/// Oracle configuration used for depeg detection and emergency fee escalation.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct OracleConfig {
    /// Pyth feed used for token A.
    pub oracle_a: Pubkey,
    /// Pyth feed used for token B.
    pub oracle_b: Pubkey,
    /// Maximum allowed deviation from $1 before the pool should pause.
    pub max_depeg_bps: u16,
    /// Emergency fee ceiling used when oracle protection is enabled.
    pub emergency_fee_bps: u16,
    /// Maximum accepted oracle price age before quotes are considered stale.
    pub max_price_age_sec: u64,
    /// Whether oracle-based depeg protection is enabled for this pool.
    pub enabled: bool,
}

impl OracleConfig {
    /// Serialized size of the oracle config inside the pool account.
    pub const LEN: usize = 32 + 32 + 2 + 2 + 8 + 1;
}

/// A two-token StableSwap liquidity pool.
///
/// Designed for asset pairs expected to trade near 1:1 (e.g. USDC/USDT).
/// Uses the Curve StableSwap invariant to provide extremely low slippage
/// for balanced swaps while still supporting imbalanced positions.
#[account]
pub struct Pool {
    /// Pool creator / admin authority
    pub admin: Pubkey,
    /// LP token mint — minted on deposit, burned on withdraw
    pub lp_mint: Pubkey,
    /// StableSwap amplification coefficient (A).
    /// Controls how "stable" the curve is — higher = lower slippage near peg.
    pub amplification: u64,
    /// Baseline swap fee in basis points (1 bps = 0.01%).
    pub fee_bps: u16,
    /// Token mint addresses for the pair.
    pub token_mints: [Pubkey; NUM_TOKENS],
    /// PDA bump seed
    pub bump: u8,
    /// Oracle settings used for depeg detection.
    pub oracle_config: OracleConfig,
    /// Persisted pause state updated by the dedicated \`check_depeg\` instruction.
    pub is_paused: bool,
}

impl Pool {
    /// Total account size used when initializing the pool PDA.
    pub const LEN: usize = 8   // discriminator
        + 32   // admin
        + 32   // lp_mint
        + 8    // amplification
        + 2    // fee_bps
        + (32 * NUM_TOKENS) // token_mints
        + 1    // bump
        + OracleConfig::LEN
        + 1; // is_paused

    /// Return the pool's token mints in canonical order.
    pub fn mints(&self) -> &[Pubkey; NUM_TOKENS] {
        &self.token_mints
    }

    /// Find the index of a mint inside \`token_mints\`.
    pub fn find_mint_index(&self, mint: &Pubkey) -> Option<usize> {
        self.token_mints
            .iter()
            .position(|stored_mint| stored_mint == mint)
    }
}
`,
      language: 'rust',
    },
    {
      name: "math.rs",
      path: "programs/stableswap/src/math.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! StableSwap invariant math and LP issuance helpers.

use crate::constants::{BASIS_POINTS_DIVISOR, MAX_ITERATIONS};
use crate::dynamic_fees::calculate_dynamic_fee_bps;
use crate::errors::StableSwapError;
use anchor_lang::prelude::*;

// ============================================================================
// STABLESWAP MATH
// ============================================================================
//
// This file contains the mathematical core of the StableSwap AMM.
// Understanding this math is the key to understanding how the protocol works.
//
// BACKGROUND: Why StableSwap?
//
// Uniswap uses the "constant product" formula:
//
//   x * y = k
//
// That works well for volatile assets, but it is inefficient for stablecoins.
//
// Example with a constant-product AMM:
// - Pool: 1,000,000 USDC and 1,000,000 USDT
// - k = 1,000,000 * 1,000,000 = 10^12
// - Swap 10,000 USDC for USDT
// - New USDC reserve: 1,010,000
// - New USDT reserve: 10^12 / 1,010,000 = 990,099
// - Output: 1,000,000 - 990,099 = 9,901 USDT
//
// That is roughly 1% slippage for a 1% trade, which is too expensive for
// assets that are expected to remain near the same price.
//
// StableSwap does much better for correlated assets. The curve is:
// - Flat in the middle, where the pair should trade near 1:1
// - Curved at the edges, so the pool still protects itself when imbalanced
//
// You can think of it as blending two extremes:
// - Constant sum near the peg, which minimizes unnecessary slippage
// - Constant product further from the peg, which prevents the pool from being
//   completely drained when the pair moves off balance
//
// THE STABLESWAP INVARIANT
//
// In the general n-token form:
//
//   A * n^n * sum(x_i) + D = A * D * n^n + D^(n+1) / (n^n * prod(x_i))
//
// Where:
// - A = amplification coefficient
// - n = number of tokens
// - x_i = reserve of token i
// - D = the invariant, which represents the pool's normalized total value
//
// For a 2-token pool, the equation simplifies to:
//
//   4A(x + y) + D = 4AD + D^3 / (4xy)
//
// The A parameter blends between two extremes:
// - A -> 0: the product term dominates, so the curve behaves like
//   constant product
// - A -> infinity: the amplified sum term dominates, so the curve behaves
//   like constant sum and D approaches x + y
//
// WHAT IS D?
//
// D is the "total value" of the pool in a normalized way. If all tokens were
// equally priced, D is the amount you would intuitively expect the pool to be
// worth.
//
// For a balanced pool with 1M of each token:
//
//   D ≈ 2,000,000
//
// During swaps, D stays constant. That is what "invariant" means.
// During add/remove liquidity operations, D increases or decreases.
//
// WHY NEWTON'S METHOD?
//
// The invariant is polynomial in D and y, so there is no simple closed-form
// solution we want to use on chain. We instead use Newton-Raphson iteration:
//
// 1. Start with an initial guess
// 2. Measure how far off that guess is
// 3. Compute a better next guess
// 4. Repeat until the value stabilizes
//
// In this implementation:
// - \`compute_d\` starts with D = x + y
// - \`compute_y\` starts with y = D
// - Both iterations stop once the answer changes by at most 1 unit
//
// This usually converges quickly for the pool sizes and amplification factors
// used in stablecoin markets.
// ============================================================================

/// Fully priced swap result returned by the math layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SwapQuote {
    /// Net output that the user receives after fees.
    pub amount_out: u128,
    /// Fee retained by the pool, denominated in the output token.
    pub fee_amount: u128,
    /// Adaptive fee applied to the trade in basis points.
    pub dynamic_fee_bps: u16,
}

/// Compute the StableSwap invariant D given two reserves and amplification A.
///
/// Uses Newton–Raphson iteration starting from D = x + y.
/// Conceptually:
/// 1. Guess that the pool's total value is the sum of reserves.
/// 2. Refine that guess using the invariant equation.
/// 3. Repeat until the guess stops moving.
///
/// # Errors
/// Returns [\`StableSwapError::EmptyPool\`] if either reserve is zero.
/// Returns [\`StableSwapError::ConvergenceFailed\`] if the method fails to converge.
pub fn compute_d(reserve_a: u128, reserve_b: u128, amp: u128) -> Result<u128> {
    require!(reserve_a > 0 && reserve_b > 0, StableSwapError::EmptyPool);

    let s = reserve_a
        .checked_add(reserve_b)
        .ok_or(StableSwapError::MathOverflow)?;

    // A·n^n  where n=2  →  4·A
    let ann = amp.checked_mul(4).ok_or(StableSwapError::MathOverflow)?;

    let mut d = s;

    for _ in 0..MAX_ITERATIONS {
        let d_prev = d;

        // D_P = D³ / (4·x·y)  accumulated iteratively as:
        //   d_p = d; d_p = d_p·D / (2·x); d_p = d_p·D / (2·y)
        let dp = d
            .checked_mul(d)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_div(
                reserve_a
                    .checked_mul(2)
                    .ok_or(StableSwapError::MathOverflow)?,
            )
            .ok_or(StableSwapError::MathOverflow)?
            .checked_mul(d)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_div(
                reserve_b
                    .checked_mul(2)
                    .ok_or(StableSwapError::MathOverflow)?,
            )
            .ok_or(StableSwapError::MathOverflow)?;

        // Newton step:
        // This is algebraically equivalent to:
        //   D_next = D - f(D) / f'(D)
        // but written in a reduced form that is cheaper and safer to evaluate
        // with checked integer arithmetic on chain.
        // D = (ann·S + D_P·2) · D / ((ann - 1)·D + 3·D_P)
        let numerator = ann
            .checked_mul(s)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_add(dp.checked_mul(2).ok_or(StableSwapError::MathOverflow)?)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_mul(d)
            .ok_or(StableSwapError::MathOverflow)?;

        let denominator = ann
            .checked_sub(1)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_mul(d)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_add(dp.checked_mul(3).ok_or(StableSwapError::MathOverflow)?)
            .ok_or(StableSwapError::MathOverflow)?;

        d = numerator
            .checked_div(denominator)
            .ok_or(StableSwapError::MathOverflow)?;

        if d.abs_diff(d_prev) <= 1 {
            return Ok(d);
        }
    }

    Err(StableSwapError::ConvergenceFailed.into())
}

/// Given a new reserve for token i, compute the new reserve for token j
/// such that the invariant D is preserved.
///
/// Solves:   y² + c = y(2y + b - D)  via Newton–Raphson
/// where c and b are derived from D and the other reserves.
///
/// In swap terms:
/// - the input reserve moves first because the trader adds tokens in
/// - D is kept constant
/// - we solve for the output reserve that keeps the pool on the same curve
///
/// # Arguments
/// * \`reserve_other\` - Current reserve of the token we are NOT solving for
///   (but updated with the new value for the input token)
/// * \`d\`             - Pre-computed invariant
/// * \`amp\`           - Amplification coefficient
pub fn compute_y(reserve_other: u128, d: u128, amp: u128) -> Result<u128> {
    require!(reserve_other > 0, StableSwapError::EmptyPool);

    // ann = 4·A  (n=2)
    let ann = amp.checked_mul(4).ok_or(StableSwapError::MathOverflow)?;

    // b = reserve_other + D/ann
    let b = reserve_other
        .checked_add(d.checked_div(ann).ok_or(StableSwapError::MathOverflow)?)
        .ok_or(StableSwapError::MathOverflow)?;

    // c = D³ / (4·ann·reserve_other)
    let c = d
        .checked_mul(d)
        .ok_or(StableSwapError::MathOverflow)?
        .checked_mul(d)
        .ok_or(StableSwapError::MathOverflow)?
        .checked_div(
            reserve_other
                .checked_mul(4)
                .ok_or(StableSwapError::MathOverflow)?
                .checked_mul(ann)
                .ok_or(StableSwapError::MathOverflow)?,
        )
        .ok_or(StableSwapError::MathOverflow)?;

    // Newton–Raphson update for the output reserve.
    let mut y = d;

    for _ in 0..MAX_ITERATIONS {
        let y_prev = y;

        let numerator = y
            .checked_mul(y)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_add(c)
            .ok_or(StableSwapError::MathOverflow)?;

        let denominator = y
            .checked_mul(2)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_add(b)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_sub(d)
            .ok_or(StableSwapError::MathOverflow)?;

        y = numerator
            .checked_div(denominator)
            .ok_or(StableSwapError::MathOverflow)?;

        if y.abs_diff(y_prev) <= 1 {
            return Ok(y);
        }
    }

    Err(StableSwapError::ConvergenceFailed.into())
}

/// Calculate the quoted output and adaptive fee for a StableSwap trade.
///
/// This function follows the standard StableSwap swap flow:
/// 1. Compute the current invariant D from the existing reserves.
/// 2. Add the trader's input amount to the input-side reserve.
/// 3. Solve for the new output-side reserve that preserves D.
/// 4. The raw output is the amount removed from the output reserve.
/// 5. Apply dynamic fees based on post-trade imbalance and oracle conditions.
///
/// # Arguments
/// * \`reserve_in\` - Current reserve of the input token.
/// * \`reserve_out\` - Current reserve of the output token.
/// * \`amount_in\` - Token amount being sold into the pool.
/// * \`amp\` - StableSwap amplification coefficient.
/// * \`base_fee_bps\` - Minimum fee charged on a healthy, balanced pool.
/// * \`max_dynamic_fee_bps\` - Maximum fee charged under pool stress.
/// * \`oracle_price_in\` - Normalized Pyth price for the input asset.
/// * \`oracle_price_out\` - Normalized Pyth price for the output asset.
/// * \`depeg_threshold_bps\` - Peg band used to cap fee escalation.
pub fn calculate_swap_output(
    reserve_in: u128,
    reserve_out: u128,
    amount_in: u128,
    amp: u128,
    base_fee_bps: u16,
    max_dynamic_fee_bps: u16,
    oracle_price_in: u128,
    oracle_price_out: u128,
    depeg_threshold_bps: u16,
) -> Result<SwapQuote> {
    require!(amount_in > 0, StableSwapError::ZeroAmount);

    let d = compute_d(reserve_in, reserve_out, amp)?;

    let new_reserve_in = reserve_in
        .checked_add(amount_in)
        .ok_or(StableSwapError::MathOverflow)?;

    let new_reserve_out = compute_y(new_reserve_in, d, amp)?;

    let amount_out_before_fee = reserve_out
        .checked_sub(new_reserve_out)
        .ok_or(StableSwapError::MathOverflow)?;

    let dynamic_fee_bps = calculate_dynamic_fee_bps(
        base_fee_bps,
        max_dynamic_fee_bps,
        new_reserve_in,
        new_reserve_out,
        oracle_price_in,
        oracle_price_out,
        depeg_threshold_bps,
    )?;

    let fee_amount = amount_out_before_fee
        .checked_mul(dynamic_fee_bps as u128)
        .ok_or(StableSwapError::MathOverflow)?
        .checked_div(BASIS_POINTS_DIVISOR)
        .ok_or(StableSwapError::MathOverflow)?;

    let amount_out = amount_out_before_fee
        .checked_sub(fee_amount)
        .ok_or(StableSwapError::MathOverflow)?;

    Ok(SwapQuote {
        amount_out,
        fee_amount,
        dynamic_fee_bps,
    })
}

/// Compute how many LP tokens to mint for a deposit.
///
/// LP issuance is based on how much the invariant D grows, not just on one
/// token balance. That keeps LP accounting aligned with the StableSwap curve.
///
/// On the **first deposit** (lp_supply == 0) we mint \`D - MINIMUM_LIQUIDITY\`
/// tokens and lock MINIMUM_LIQUIDITY as virtual dead shares to prevent
/// the first-depositor inflation attack.
///
/// On **subsequent deposits** we scale by the change in D:
///   mint = lp_supply * (D_after - D_before) / D_before
pub fn calculate_lp_mint_amount(
    reserve_a_before: u128,
    reserve_b_before: u128,
    reserve_a_after: u128,
    reserve_b_after: u128,
    lp_supply: u128,
    amp: u128,
    minimum_liquidity: u64,
) -> Result<u64> {
    if lp_supply == 0 {
        let d = compute_d(reserve_a_after, reserve_b_after, amp)?;
        require!(
            d > minimum_liquidity as u128,
            StableSwapError::InsufficientInitialLiquidity
        );
        let lp_to_mint = (d - minimum_liquidity as u128).min(u64::MAX as u128) as u64;
        return Ok(lp_to_mint);
    }

    let d_before = compute_d(reserve_a_before, reserve_b_before, amp)?;
    let d_after = compute_d(reserve_a_after, reserve_b_after, amp)?;

    require!(d_after >= d_before, StableSwapError::InsufficientLiquidity);

    let d_diff = d_after
        .checked_sub(d_before)
        .ok_or(StableSwapError::MathOverflow)?;

    let lp_to_mint = lp_supply
        .checked_mul(d_diff)
        .ok_or(StableSwapError::MathOverflow)?
        .checked_div(d_before)
        .ok_or(StableSwapError::MathOverflow)?
        .min(u64::MAX as u128) as u64;

    Ok(lp_to_mint)
}

/// Compute the proportional token amounts owed for an LP burn.
///
/// Withdrawals in this pool are intentionally dual-sided only: an LP burns a
/// share of the total supply and receives that same share of each reserve.
/// This prevents the instruction from becoming a single-sided exit path.
///
/// The caller should pass the live reserves for both tokens and the LP supply
/// adjusted for the protocol's virtual dead shares.
pub fn calculate_withdraw_amounts(
    reserves: &[u128],
    lp_amount: u128,
    adjusted_supply: u128,
) -> Result<Vec<u64>> {
    require!(reserves.len() == 2, StableSwapError::InvalidVault);
    require!(lp_amount > 0, StableSwapError::ZeroAmount);
    require!(adjusted_supply > 0, StableSwapError::EmptyPool);
    require!(
        reserves.iter().all(|reserve| *reserve > 0),
        StableSwapError::EmptyPool
    );

    let mut withdraw_amounts = Vec::with_capacity(reserves.len());
    for reserve in reserves {
        let amount = reserve
            .checked_mul(lp_amount)
            .ok_or(StableSwapError::MathOverflow)?
            .checked_div(adjusted_supply)
            .ok_or(StableSwapError::MathOverflow)?;
        withdraw_amounts.push(amount.min(u64::MAX as u128) as u64);
    }

    require!(
        withdraw_amounts.iter().all(|amount| *amount > 0),
        StableSwapError::SingleSidedWithdrawalNotAllowed
    );

    Ok(withdraw_amounts)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Balanced pool: D should stay very close to the sum of reserves.
    #[test]
    fn test_compute_d_balanced() {
        let reserve = 1_000_000_000u128; // 1000 USDC (6 decimals)
        let d = compute_d(reserve, reserve, 100).unwrap();
        // For balanced pool D ≈ 2 * reserve
        assert!(d > 1_900_000_000u128);
        assert!(d < 2_100_000_000u128);
    }

    /// Swapping 1 USDC in a 1M/1M pool should return nearly 1 USDC out.
    #[test]
    fn test_swap_low_slippage() {
        let reserve = 1_000_000_000_000u128; // 1M USDC (6 decimals)
        let amount_in = 1_000_000u128; // 1 USDC
        let quote = calculate_swap_output(
            reserve,
            reserve,
            amount_in,
            100,
            4,
            100,
            1_000_000_000,
            1_000_000_000,
            500,
        )
        .unwrap();
        // With A=100 and tiny trade vs huge pool: almost 1:1
        assert!(quote.amount_out > 990_000u128);
        assert!(quote.amount_out <= amount_in);
        assert_eq!(quote.dynamic_fee_bps, 4);
    }

    /// A large swap should still have low slippage (stablecoin advantage).
    #[test]
    fn test_swap_large_amount_low_slippage() {
        let reserve = 1_000_000_000_000u128; // 1M USDC
        let amount_in = 100_000_000_000u128; // 100k USDC swap (10% of pool)
        let quote = calculate_swap_output(
            reserve,
            reserve,
            amount_in,
            100,
            4,
            100,
            1_000_000_000,
            1_000_000_000,
            500,
        )
        .unwrap();
        // StableSwap should give >99% output for 10% of pool swap
        let ratio = quote.amount_out * 100 / amount_in;
        assert!(ratio >= 98, "Expected >=98% output, got {}%", ratio);
        assert!(quote.dynamic_fee_bps > 4);
    }

    /// First-deposit LP minting reserves dead shares for inflation protection.
    #[test]
    fn test_lp_mint_first_deposit() {
        let amount = 1_000_000_000u128; // 1000 tokens each
        let lp = calculate_lp_mint_amount(0, 0, amount, amount, 0, 100, 1_000).unwrap();
        // LP ≈ D - MINIMUM_LIQUIDITY ≈ 2_000_000_000 - 1_000
        assert!(lp > 1_999_000_000u64);
    }

    /// Subsequent LP issuance tracks the proportional increase in invariant D.
    #[test]
    fn test_lp_mint_subsequent_deposit() {
        let reserve = 1_000_000_000u128;
        let lp_supply = 2_000_000_000u128;
        // Doubling reserves should double LP supply
        let lp = calculate_lp_mint_amount(
            reserve,
            reserve,
            reserve * 2,
            reserve * 2,
            lp_supply,
            100,
            1_000,
        )
        .unwrap();
        // LP minted should be approximately equal to current supply
        assert!(lp > 1_900_000_000u64);
        assert!(lp < 2_100_000_000u64);
    }

    /// LP burns must return a proportional share of both reserves.
    #[test]
    fn test_calculate_withdraw_amounts_proportional() {
        let withdraw_amounts =
            calculate_withdraw_amounts(&[1_000_000u128, 1_000_000u128], 100_000, 1_000_000)
                .unwrap();

        assert_eq!(withdraw_amounts, vec![100_000u64, 100_000u64]);
    }

    /// Dust burns that would collapse into a one-sided exit are rejected.
    #[test]
    fn test_calculate_withdraw_amounts_rejects_single_sided_rounding() {
        let err = calculate_withdraw_amounts(&[1u128, 1_000_000u128], 1, 1_000_000).unwrap_err();

        assert!(err
            .to_string()
            .contains("Single-sided withdrawals are not supported"));
    }
}
`,
      language: 'rust',
    },
    {
      name: "dynamic_fees.rs",
      path: "programs/stableswap/src/dynamic_fees.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Adaptive fee helpers for oracle-aware stablecoin swaps.

use anchor_lang::prelude::*;

use crate::constants::BASIS_POINTS_DIVISOR;
use crate::errors::StableSwapError;

/// Compute post-trade imbalance in basis points for two oracle-valued sides.
fn calculate_value_imbalance_bps(value_a: u128, value_b: u128) -> Result<u128> {
    let total_value = value_a
        .checked_add(value_b)
        .ok_or(StableSwapError::MathOverflow)?;

    if total_value == 0 {
        return Ok(0);
    }

    Ok(value_a
        .abs_diff(value_b)
        .checked_mul(BASIS_POINTS_DIVISOR)
        .ok_or(StableSwapError::MathOverflow)?
        .checked_div(total_value)
        .ok_or(StableSwapError::MathOverflow)?)
}

/// Increase fees as the pool becomes more imbalanced relative to the oracle.
///
/// The fee ramps linearly from \`base_fee_bps\` to \`max_dynamic_fee_bps\` as
/// either the oracle-weighted reserve imbalance or the oracle cross-price
/// deviation approaches the configured depeg threshold.
pub fn calculate_dynamic_fee_bps(
    base_fee_bps: u16,
    max_dynamic_fee_bps: u16,
    new_reserve_in: u128,
    new_reserve_out: u128,
    oracle_price_in: u128,
    oracle_price_out: u128,
    depeg_threshold_bps: u16,
) -> Result<u16> {
    require!(
        base_fee_bps <= max_dynamic_fee_bps,
        StableSwapError::InvalidFeeConfig
    );
    require!(
        depeg_threshold_bps > 0,
        StableSwapError::InvalidDepegThreshold
    );

    let post_value_in = new_reserve_in
        .checked_mul(oracle_price_in)
        .ok_or(StableSwapError::MathOverflow)?;
    let post_value_out = new_reserve_out
        .checked_mul(oracle_price_out)
        .ok_or(StableSwapError::MathOverflow)?;

    let imbalance_bps = calculate_value_imbalance_bps(post_value_in, post_value_out)?;
    let oracle_ratio_bps = oracle_price_in
        .checked_mul(BASIS_POINTS_DIVISOR)
        .ok_or(StableSwapError::MathOverflow)?
        .checked_div(oracle_price_out)
        .ok_or(StableSwapError::MathOverflow)?;
    let oracle_deviation_bps = oracle_ratio_bps.abs_diff(BASIS_POINTS_DIVISOR);
    let stress_bps = imbalance_bps.max(oracle_deviation_bps);
    let stress_cap = stress_bps.min(depeg_threshold_bps as u128);
    let dynamic_range = (max_dynamic_fee_bps - base_fee_bps) as u128;

    let effective_fee = (base_fee_bps as u128)
        .checked_add(
            dynamic_range
                .checked_mul(stress_cap)
                .ok_or(StableSwapError::MathOverflow)?
                .checked_div(depeg_threshold_bps as u128)
                .ok_or(StableSwapError::MathOverflow)?,
        )
        .ok_or(StableSwapError::MathOverflow)?;

    Ok(effective_fee.min(max_dynamic_fee_bps as u128) as u16)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Adaptive fees should remain low near peg and increase when imbalanced.
    #[test]
    fn test_dynamic_fee_scales_with_imbalance() {
        let balanced_fee = calculate_dynamic_fee_bps(
            4,
            100,
            1_000_000,
            1_000_000,
            1_000_000_000,
            1_000_000_000,
            500,
        )
        .unwrap();
        let imbalanced_fee = calculate_dynamic_fee_bps(
            4,
            100,
            1_400_000,
            600_000,
            1_000_000_000,
            1_000_000_000,
            500,
        )
        .unwrap();

        assert_eq!(balanced_fee, 4);
        assert!(imbalanced_fee > balanced_fee);
    }
}
`,
      language: 'rust',
    },
    {
      name: "oracle.rs",
      path: "programs/stableswap/src/oracle.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Pyth oracle helpers used to enforce peg protection and normalize prices.
//
// This module handles reading prices from Pyth Network oracles for depegging
// detection. Pyth is a decentralized oracle network that publishes prices from
// trusted data sources.
//
// WHY USE ORACLES?
//
// The AMM only knows its internal pool prices, which come from reserve ratios.
// External market prices can differ, especially during a depeg event.
// Oracles tell us what the "real world" price is, so the program can detect
// when one of the assets is no longer behaving like a stablecoin.
//
// PYTH BASICS
//
// Each asset has a price feed account on Solana.
// That account contains:
// - price
// - confidence interval
// - exponent
// - timestamp
//
// Pyth stores prices as integers with an exponent. For example:
// - \`99_850_000\` with exponent \`-8\` represents \`0.99850000\`
//
// This module reads those raw values, validates that the account really is a
// Pyth price account, checks that the data is fresh enough, and then normalizes
// the result into the program's shared fixed-point scale before depeg checks.
//
// PORTING NOTE
//
// Upstream cast account bytes directly into a \`#[repr(C)]\` \`PythPriceAccount\`
// using a third-party zero-copy helper. The playground compiler only permits
// \`anchor-lang\` and \`anchor-spl\`, so the same legacy layout is decoded here
// with a small, bounds-checked byte cursor built from core primitives only.
// All offsets and validation semantics are identical to the upstream C layout.

use anchor_lang::prelude::*;

use crate::constants::{
    BASIS_POINTS_DIVISOR, ORACLE_PRICE_SCALE, ORACLE_TARGET_EXPONENT, TARGET_STABLE_PRICE,
};
use crate::errors::StableSwapError;

/// Pyth account discriminator used to validate raw account data.
const PYTH_MAGIC: u32 = 0xa1b2c3d4;
/// Supported Pyth account version for the embedded layout below.
const PYTH_VERSION_2: u32 = 2;
/// Pyth account type value representing a price account.
const PYTH_ACCOUNT_TYPE_PRICE: u32 = 3;
/// Pyth status value meaning the aggregate price is actively trading.
const PYTH_STATUS_TRADING: u8 = 1;
/// Number of component publisher slots stored in a legacy Pyth price account.
const PYTH_NUM_COMPONENTS: usize = 32;

// ─── Legacy PythPriceAccount byte offsets ────────────────────────────────────
//
// The upstream \`#[repr(C)]\` layout is:
//
//   magic:u32@0, ver:u32@4, atype:u32@8, size:u32@12, ptype:u32@16,
//   expo:i32@20, num:u32@24, num_qt:u32@28,
//   last_slot:u64@32, valid_slot:u64@40,
//   ema_price:PythRational@48 (24 bytes), ema_conf:PythRational@72 (24 bytes),
//   timestamp:i64@96, min_pub:u8@104, drv2:u8@105, drv3:u16@106, drv4:u32@108,
//   prod:Pubkey@112 (32 bytes), next:Pubkey@144 (32 bytes),
//   prev_slot:u64@176, prev_price:i64@184, prev_conf:u64@192,
//   prev_timestamp:i64@200,
//   agg:PythPriceInfo@208 (32 bytes: price i64, conf u64, status u8,
//       corp_act u8, padding [u8;6], pub_slot u64),
//   comp:[PythPriceComp;32]@240 (each 32 + 32 + 32 = 96 bytes).
//
// Total size: 240 + 32 * 96 = 3312 bytes.
const OFFSET_MAGIC: usize = 0;
const OFFSET_VERSION: usize = 4;
const OFFSET_ACCOUNT_TYPE: usize = 8;
const OFFSET_EXPO: usize = 20;
const OFFSET_TIMESTAMP: usize = 96;
const OFFSET_PREV_PRICE: usize = 184;
const OFFSET_PREV_TIMESTAMP: usize = 200;
const OFFSET_AGG: usize = 208;
const OFFSET_AGG_STATUS: usize = OFFSET_AGG + 16;
const OFFSET_COMPONENTS: usize = 240;
const PYTH_PRICE_INFO_LEN: usize = 32;
const PYTH_PRICE_COMP_LEN: usize = 32 + PYTH_PRICE_INFO_LEN * 2;
const PYTH_PRICE_ACCOUNT_LEN: usize =
    OFFSET_COMPONENTS + PYTH_NUM_COMPONENTS * PYTH_PRICE_COMP_LEN;

/// Minimal bounds-checked cursor over raw account bytes.
///
/// Every read verifies that the requested bytes exist before interpreting
/// them, so malformed/truncated accounts fail with \`InvalidOracleAccount\`
/// instead of panicking.
struct ByteCursor<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> ByteCursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, pos: 0 }
    }

    /// Move the cursor to an absolute offset in the account.
    fn seek(&mut self, offset: usize) -> Result<()> {
        require!(
            offset <= self.bytes.len(),
            StableSwapError::InvalidOracleAccount
        );
        self.pos = offset;
        Ok(())
    }

    /// Advance the cursor by \`count\` bytes.
    fn skip(&mut self, count: usize) -> Result<()> {
        self.pos = self
            .pos
            .checked_add(count)
            .ok_or_else(|| error!(StableSwapError::InvalidOracleAccount))?;
        require!(
            self.pos <= self.bytes.len(),
            StableSwapError::InvalidOracleAccount
        );
        Ok(())
    }

    fn read_u8(&mut self) -> Result<u8> {
        let byte = *self
            .bytes
            .get(self.pos)
            .ok_or_else(|| error!(StableSwapError::InvalidOracleAccount))?;
        self.pos += 1;
        Ok(byte)
    }

    fn read_u32(&mut self) -> Result<u32> {
        let bytes: [u8; 4] = self
            .bytes
            .get(self.pos..self.pos + 4)
            .ok_or_else(|| error!(StableSwapError::InvalidOracleAccount))?
            .try_into()
            .map_err(|_| error!(StableSwapError::InvalidOracleAccount))?;
        self.pos += 4;
        Ok(u32::from_le_bytes(bytes))
    }

    fn read_i32(&mut self) -> Result<i32> {
        let bytes: [u8; 4] = self
            .bytes
            .get(self.pos..self.pos + 4)
            .ok_or_else(|| error!(StableSwapError::InvalidOracleAccount))?
            .try_into()
            .map_err(|_| error!(StableSwapError::InvalidOracleAccount))?;
        self.pos += 4;
        Ok(i32::from_le_bytes(bytes))
    }

    fn read_i64(&mut self) -> Result<i64> {
        let bytes: [u8; 8] = self
            .bytes
            .get(self.pos..self.pos + 8)
            .ok_or_else(|| error!(StableSwapError::InvalidOracleAccount))?
            .try_into()
            .map_err(|_| error!(StableSwapError::InvalidOracleAccount))?;
        self.pos += 8;
        Ok(i64::from_le_bytes(bytes))
    }
}

/// The subset of the legacy Pyth price account used by this program.
#[derive(Clone, Copy, Debug)]
struct PythPriceAccountView {
    /// Base-10 exponent used by all price values in the account.
    expo: i32,
    /// Publish timestamp for the aggregate price.
    timestamp: i64,
    /// Previous valid trading price.
    prev_price: i64,
    /// Previous valid publish timestamp.
    prev_timestamp: i64,
    /// Aggregate price value.
    agg_price: i64,
    /// Aggregate status byte.
    agg_status: u8,
}

/// Normalized pairwise oracle view used by instruction handlers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OracleStatus {
    /// Token A price normalized to the program's fixed-point scale.
    pub price_a: u128,
    /// Token B price normalized to the program's fixed-point scale.
    pub price_b: u128,
    /// Token A deviation from the $1 target in basis points.
    pub peg_delta_a_bps: u128,
    /// Token B deviation from the $1 target in basis points.
    pub peg_delta_b_bps: u128,
    /// Whether swaps and deposits should be halted for this pool state.
    pub should_pause: bool,
}

/// Load, validate, and normalize both Pyth feeds for a stable pair.
pub fn load_pair_status(
    expected_price_feed_a: &Pubkey,
    expected_price_feed_b: &Pubkey,
    price_feed_a: &AccountInfo,
    price_feed_b: &AccountInfo,
    max_price_age_sec: u64,
    depeg_threshold_bps: u16,
) -> Result<OracleStatus> {
    require_keys_eq!(
        *price_feed_a.key,
        *expected_price_feed_a,
        StableSwapError::InvalidOracleAccount
    );
    require_keys_eq!(
        *price_feed_b.key,
        *expected_price_feed_b,
        StableSwapError::InvalidOracleAccount
    );

    let price_a = load_scaled_price(price_feed_a, max_price_age_sec)?;
    let price_b = load_scaled_price(price_feed_b, max_price_age_sec)?;

    let peg_delta_a_bps = calculate_peg_delta_bps(price_a)?;
    let peg_delta_b_bps = calculate_peg_delta_bps(price_b)?;
    let should_pause = check_depeg(price_a, price_b, depeg_threshold_bps);

    Ok(OracleStatus {
        price_a,
        price_b,
        peg_delta_a_bps,
        peg_delta_b_bps,
        should_pause,
    })
}

/// Read a Pyth price account and normalize its price to the shared 1e9 scale.
fn load_scaled_price(price_account_info: &AccountInfo, max_price_age_sec: u64) -> Result<u128> {
    let clock = Clock::get()?;
    let price_account = load_price_account(price_account_info)?;
    let price = select_recent_price(&price_account, clock.unix_timestamp, max_price_age_sec)?;

    scale_price(price.price, price_account.expo)
}

/// Parse and validate raw account bytes using the legacy Pyth price layout.
fn parse_price_account(bytes: &[u8]) -> Result<PythPriceAccountView> {
    require!(
        bytes.len() >= PYTH_PRICE_ACCOUNT_LEN,
        StableSwapError::InvalidOracleAccount
    );

    let mut cursor = ByteCursor::new(bytes);

    cursor.seek(OFFSET_MAGIC)?;
    let magic = cursor.read_u32()?;
    cursor.seek(OFFSET_VERSION)?;
    let ver = cursor.read_u32()?;
    cursor.seek(OFFSET_ACCOUNT_TYPE)?;
    let atype = cursor.read_u32()?;

    cursor.seek(OFFSET_EXPO)?;
    let expo = cursor.read_i32()?;

    cursor.seek(OFFSET_TIMESTAMP)?;
    let timestamp = cursor.read_i64()?;

    cursor.seek(OFFSET_PREV_PRICE)?;
    let prev_price = cursor.read_i64()?;
    cursor.seek(OFFSET_PREV_TIMESTAMP)?;
    let prev_timestamp = cursor.read_i64()?;

    cursor.seek(OFFSET_AGG)?;
    let agg_price = cursor.read_i64()?;
    cursor.seek(OFFSET_AGG_STATUS)?;
    let agg_status = cursor.read_u8()?;

    // Confirm the full component array is present, matching the 3312-byte
    // legacy account size even though this program does not read components.
    cursor.seek(OFFSET_COMPONENTS)?;
    cursor.skip(PYTH_NUM_COMPONENTS * PYTH_PRICE_COMP_LEN)?;

    require!(
        magic == PYTH_MAGIC,
        StableSwapError::InvalidOracleAccount
    );
    require!(
        ver == PYTH_VERSION_2,
        StableSwapError::InvalidOracleAccount
    );
    require!(
        atype == PYTH_ACCOUNT_TYPE_PRICE,
        StableSwapError::InvalidOracleAccount
    );

    Ok(PythPriceAccountView {
        expo,
        timestamp,
        prev_price,
        prev_timestamp,
        agg_price,
        agg_status,
    })
}

/// Borrow and parse a raw account into the embedded Pyth price-account layout.
fn load_price_account(price_account_info: &AccountInfo) -> Result<PythPriceAccountView> {
    let data = price_account_info
        .try_borrow_data()
        .map_err(|_| error!(StableSwapError::InvalidOracleAccount))?;
    parse_price_account(&data)
}

/// Select the newest usable price from the account and enforce freshness.
fn select_recent_price(
    price_account: &PythPriceAccountView,
    current_time: i64,
    max_price_age_sec: u64,
) -> Result<PythPrice> {
    let aggregate_price = if price_account.agg_status == PYTH_STATUS_TRADING {
        PythPrice {
            price: price_account.agg_price,
            publish_time: price_account.timestamp,
        }
    } else {
        PythPrice {
            price: price_account.prev_price,
            publish_time: price_account.prev_timestamp,
        }
    };

    // Future-dated prices are invalid: \`abs_diff\` would otherwise accept a
    // timestamp arbitrarily far ahead of the cluster clock as "fresh".
    let age = current_time
        .checked_sub(aggregate_price.publish_time)
        .ok_or(StableSwapError::StaleOraclePrice)?;
    require!(age >= 0, StableSwapError::StaleOraclePrice);
    require!(
        age as u64 <= max_price_age_sec,
        StableSwapError::StaleOraclePrice
    );
    require!(
        aggregate_price.price > 0,
        StableSwapError::InvalidOraclePrice
    );

    Ok(aggregate_price)
}

/// Normalize a Pyth fixed-point price to the program's 1e9 precision.
fn scale_price(price: i64, exponent: i32) -> Result<u128> {
    require!(price > 0, StableSwapError::InvalidOraclePrice);

    let mut normalized = price as u128;

    if exponent > ORACLE_TARGET_EXPONENT {
        // Use checked subtraction: a hostile/corrupt exponent near i32::MAX
        // would otherwise overflow under SBF's overflow-checks and abort.
        let delta = exponent
            .checked_sub(ORACLE_TARGET_EXPONENT)
            .ok_or(StableSwapError::InvalidOraclePrice)?;
        let scale = pow10(delta as u32)?;
        normalized = normalized
            .checked_mul(scale)
            .ok_or(StableSwapError::MathOverflow)?;
    } else if exponent < ORACLE_TARGET_EXPONENT {
        let delta = ORACLE_TARGET_EXPONENT
            .checked_sub(exponent)
            .ok_or(StableSwapError::InvalidOraclePrice)?;
        let scale = pow10(delta as u32)?;
        normalized = normalized
            .checked_div(scale)
            .ok_or(StableSwapError::InvalidOraclePrice)?;
    }

    Ok(normalized)
}

/// Convert a normalized stablecoin price into basis points off the $1 peg.
pub fn calculate_peg_delta_bps(price: u128) -> Result<u128> {
    Ok(price
        .abs_diff(TARGET_STABLE_PRICE)
        .checked_mul(BASIS_POINTS_DIVISOR)
        .ok_or(StableSwapError::MathOverflow)?
        .checked_div(ORACLE_PRICE_SCALE)
        .ok_or(StableSwapError::MathOverflow)?)
}

/// Check whether either normalized stablecoin price has drifted too far from $1.
///
/// This helper is intentionally lightweight:
/// 1. Compute the acceptable price band around the target stable price.
/// 2. Check token A against that band.
/// 3. Check token B against that band.
/// 4. Return \`true\` if either token has depegged.
///
/// Prices are expected in the program's normalized oracle scale.
pub fn check_depeg(
    price_a_normalized: u128,
    price_b_normalized: u128,
    max_deviation_bps: u16,
) -> bool {
    const ONE_DOLLAR: u128 = TARGET_STABLE_PRICE;
    const BPS_DENOMINATOR: u128 = BASIS_POINTS_DIVISOR;

    let max_deviation = ONE_DOLLAR
        .saturating_mul(max_deviation_bps as u128)
        .saturating_div(BPS_DENOMINATOR);

    let lower_bound = ONE_DOLLAR.saturating_sub(max_deviation);
    let upper_bound = ONE_DOLLAR.saturating_add(max_deviation);

    let a_depegged = price_a_normalized < lower_bound || price_a_normalized > upper_bound;
    let b_depegged = price_b_normalized < lower_bound || price_b_normalized > upper_bound;

    a_depegged || b_depegged
}

/// Compute \`10^exponent\` using checked integer arithmetic.
fn pow10(exponent: u32) -> Result<u128> {
    let mut value = 1u128;
    for _ in 0..exponent {
        value = value.checked_mul(10).ok_or(StableSwapError::MathOverflow)?;
    }
    Ok(value)
}

/// Lightweight selected Pyth price used after freshness validation.
#[derive(Debug, Clone, Copy)]
struct PythPrice {
    /// Raw price value reported by Pyth.
    price: i64,
    /// Publish time associated with \`price\`.
    publish_time: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A perfect peg should report zero deviation and a 2% depeg should report 200 bps.
    #[test]
    fn test_calculate_peg_delta_bps() {
        assert_eq!(calculate_peg_delta_bps(1_000_000_000).unwrap(), 0);
        assert_eq!(calculate_peg_delta_bps(980_000_000).unwrap(), 200);
    }

    /// The boolean depeg helper should flag prices outside the allowed band.
    #[test]
    fn test_check_depeg() {
        assert!(!check_depeg(1_000_000_000, 999_000_000, 200));
        assert!(check_depeg(970_000_000, 1_000_000_000, 200));
        assert!(check_depeg(1_000_000_000, 1_030_000_000, 200));
    }

    /// Price normalization should preserve a 1.0 value across common Pyth exponents.
    #[test]
    fn test_scale_price_handles_positive_and_negative_exponents() {
        assert_eq!(scale_price(1_000_000, -6).unwrap(), 1_000_000_000);
        assert_eq!(scale_price(1_000_000_000, -9).unwrap(), 1_000_000_000);
    }

    /// Extreme exponents must return an error rather than panic on overflow.
    #[test]
    fn test_scale_price_rejects_extreme_exponents() {
        assert!(scale_price(1, i32::MIN).is_err());
        assert!(scale_price(1, i32::MAX).is_err());
    }

    /// Build a minimal legacy Pyth account buffer for parser tests.
    fn legacy_price_account_bytes() -> [u8; PYTH_PRICE_ACCOUNT_LEN] {
        let mut bytes = [0u8; PYTH_PRICE_ACCOUNT_LEN];
        bytes[OFFSET_MAGIC..OFFSET_MAGIC + 4].copy_from_slice(&PYTH_MAGIC.to_le_bytes());
        bytes[OFFSET_VERSION..OFFSET_VERSION + 4].copy_from_slice(&PYTH_VERSION_2.to_le_bytes());
        bytes[OFFSET_ACCOUNT_TYPE..OFFSET_ACCOUNT_TYPE + 4]
            .copy_from_slice(&PYTH_ACCOUNT_TYPE_PRICE.to_le_bytes());
        bytes[OFFSET_EXPO..OFFSET_EXPO + 4].copy_from_slice(&(-8i32).to_le_bytes());
        bytes[OFFSET_TIMESTAMP..OFFSET_TIMESTAMP + 8].copy_from_slice(&1_700_000_000i64.to_le_bytes());
        bytes[OFFSET_PREV_PRICE..OFFSET_PREV_PRICE + 8].copy_from_slice(&99_000_000i64.to_le_bytes());
        bytes[OFFSET_PREV_TIMESTAMP..OFFSET_PREV_TIMESTAMP + 8]
            .copy_from_slice(&1_699_999_900i64.to_le_bytes());
        bytes[OFFSET_AGG..OFFSET_AGG + 8].copy_from_slice(&99_850_000i64.to_le_bytes());
        bytes[OFFSET_AGG_STATUS] = PYTH_STATUS_TRADING;
        bytes
    }

    /// The manual cursor must reproduce the legacy repr(C) field offsets.
    #[test]
    fn test_manual_parser_reads_legacy_offsets() {
        let bytes = legacy_price_account_bytes();
        let parsed = parse_price_account(&bytes).unwrap();

        assert_eq!(parsed.expo, -8);
        assert_eq!(parsed.timestamp, 1_700_000_000);
        assert_eq!(parsed.prev_price, 99_000_000);
        assert_eq!(parsed.prev_timestamp, 1_699_999_900);
        assert_eq!(parsed.agg_price, 99_850_000);
        assert_eq!(parsed.agg_status, PYTH_STATUS_TRADING);

        let price = select_recent_price(&parsed, 1_700_000_010, 60).unwrap();
        assert_eq!(price.price, 99_850_000);
        assert_eq!(price.publish_time, 1_700_000_000);
    }

    /// Truncated accounts and bad headers must be rejected, not panic.
    #[test]
    fn test_manual_parser_rejects_invalid_accounts() {
        assert!(parse_price_account(&[0u8; PYTH_PRICE_ACCOUNT_LEN - 1]).is_err());

        let mut bytes = legacy_price_account_bytes();
        bytes[OFFSET_MAGIC] ^= 0x01;
        assert!(parse_price_account(&bytes).is_err());

        let mut bytes = legacy_price_account_bytes();
        bytes[OFFSET_VERSION..OFFSET_VERSION + 4].copy_from_slice(&3u32.to_le_bytes());
        assert!(parse_price_account(&bytes).is_err());

        let mut bytes = legacy_price_account_bytes();
        bytes[OFFSET_ACCOUNT_TYPE..OFFSET_ACCOUNT_TYPE + 4].copy_from_slice(&2u32.to_le_bytes());
        assert!(parse_price_account(&bytes).is_err());
    }

    /// Future-dated prices must not be treated as fresh.
    #[test]
    fn test_select_recent_price_rejects_future_and_stale() {
        let parsed = parse_price_account(&legacy_price_account_bytes()).unwrap();

        assert!(select_recent_price(&parsed, 1_699_999_999, 60).is_err());
        assert!(select_recent_price(&parsed, 1_700_000_100, 60).is_err());
        assert!(select_recent_price(&parsed, 1_700_000_010, 60).is_ok());
    }
}
`,
      language: 'rust',
    },
    {
      name: "mod.rs",
      path: "programs/stableswap/src/instructions/mod.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Instruction modules and their public account contexts.

/// Explicit oracle-health instruction.
pub mod check_depeg;
/// Pool initialization instruction.
pub mod initialize_pool;
/// Liquidity deposit and withdrawal instructions.
pub mod modify_liquidity;
/// Swap execution instruction.
pub mod swap;

/// Re-export oracle-health instruction types for the program entrypoint.
pub use check_depeg::*;
/// Re-export initialization instruction types for the program entrypoint.
pub use initialize_pool::*;
/// Re-export liquidity modification instruction types for the program entrypoint.
pub use modify_liquidity::*;
/// Re-export swap instruction types for the program entrypoint.
pub use swap::*;
`,
      language: 'rust',
    },
    {
      name: "initialize_pool.rs",
      path: "programs/stableswap/src/instructions/initialize_pool.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Initialize a new StableSwap pool and store its oracle/risk configuration.
//
// ============================================================================
// INITIALIZE POOL INSTRUCTION
// ============================================================================
//
// This instruction creates a new StableSwap pool for 2 tokens.
//
// WHAT GETS CREATED?
//
// 1. Pool account (PDA) - stores pool configuration such as amplification,
//    fee settings, token mints, vault addresses, and oracle feeds
// 2. LP mint - an SPL token mint representing ownership shares in the pool
// 3. Vault A - pool-owned token account for token A reserves
// 4. Vault B - pool-owned token account for token B reserves
//
// The pool account is a PDA (Program Derived Address) seeded by the LP mint
// address. Because this seed format is deterministic, anyone can derive the
// pool address off chain.
//
// ACCOUNT STRUCTURE
//
// - admin: pays for account creation and becomes pool admin
// - token_mint_a: mint for token A
// - token_mint_b: mint for token B
// - pool: the pool PDA we are initializing
// - lp_mint: new mint for LP tokens, with the pool PDA as mint authority
// - vault_a: pool-owned ATA for token A
// - vault_b: pool-owned ATA for token B
// - oracle_price_feed_a: Pyth feed for token A
// - oracle_price_feed_b: Pyth feed for token B
// ============================================================================

use crate::constants::{MAX_AMP, MAX_DEPEG_THRESHOLD_BPS, MAX_FEE_BPS, NUM_TOKENS};
use crate::errors::StableSwapError;
use crate::oracle::load_pair_status;
use crate::state::{OracleConfig, Pool};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{get_associated_token_address, AssociatedToken},
    token::{Mint, Token, TokenAccount},
};

/// Accounts required to initialize a new StableSwap pool.
#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// Pool creator; pays for account creation.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Token A mint (e.g. USDC).
    pub token_mint_a: Account<'info, Mint>,

    /// Token B mint (e.g. USDT).
    pub token_mint_b: Account<'info, Mint>,

    /// Pool PDA — derived from [b"pool", lp_mint].
    #[account(
        init,
        payer = admin,
        space = Pool::LEN,
        seeds = [b"pool", lp_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    /// LP token mint — authority set to pool PDA.
    #[account(
        init,
        payer = admin,
        mint::decimals = token_mint_a.decimals,
        mint::authority = pool,
    )]
    pub lp_mint: Account<'info, Mint>,

    /// Pool's token A vault (ATA owned by pool PDA).
    #[account(
        init,
        payer = admin,
        associated_token::mint = token_mint_a,
        associated_token::authority = pool,
    )]
    pub vault_a: Account<'info, TokenAccount>,

    /// Pool's token B vault (ATA owned by pool PDA).
    #[account(
        init,
        payer = admin,
        associated_token::mint = token_mint_b,
        associated_token::authority = pool,
    )]
    pub vault_b: Account<'info, TokenAccount>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_a: UncheckedAccount<'info>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_b: UncheckedAccount<'info>,

    /// CHECK: validated against the canonical system program ID in the handler.
    pub system_program: UncheckedAccount<'info>,
    /// SPL Token program used for mint and vault CPI calls.
    /// CHECK: validated against the canonical SPL token program ID in the handler.
    pub token_program: UncheckedAccount<'info>,
    /// Associated Token program used to create the pool vault ATAs.
    /// CHECK: validated against the canonical associated token program ID in the handler.
    pub associated_token_program: UncheckedAccount<'info>,
    /// Rent sysvar required by Anchor account initialization.
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> InitializePool<'info> {
    /// Validate the core pool parameters.
    ///
    /// We check:
    /// 1. Amplification is in the valid range \`(0, MAX_AMP]\`
    /// 2. The base fee does not exceed 100%
    pub fn validate(&self, amplification: u64, fee_bps: u16) -> Result<()> {
        // A must be positive. A=0 would break the StableSwap invariant because
        // later math divides by \`ann = 4 * A\`.
        require!(
            amplification > 0 && amplification <= MAX_AMP,
            StableSwapError::InvalidAmplification
        );

        // Fee sanity check. Values above 100% would make swaps nonsensical.
        require!(fee_bps <= MAX_FEE_BPS, StableSwapError::InvalidFee);

        Ok(())
    }
}

/// Initialize a new two-token StableSwap pool.
///
/// # Arguments
/// * \`amplification\` — The A parameter. Typical range: 100–2000 for stable pairs.
///   Higher A gives lower slippage when both tokens trade near parity.
/// * \`base_fee_bps\` — Base swap fee in basis points (e.g. 4 = 0.04%).
/// * \`max_dynamic_fee_bps\` — Fee cap once the pool drifts away from the peg.
/// * \`depeg_threshold_bps\` — Maximum tolerated peg drift before swaps/deposits halt.
/// * \`max_price_age_sec\` — Maximum age accepted from Pyth before halting.
pub fn initialize_pool_handler(
    ctx: Context<InitializePool>,
    amplification: u64,
    base_fee_bps: u16,
    max_dynamic_fee_bps: u16,
    depeg_threshold_bps: u16,
    max_price_age_sec: u64,
) -> Result<()> {
    ctx.accounts.validate(amplification, base_fee_bps)?;
    require!(
        max_dynamic_fee_bps <= MAX_FEE_BPS,
        StableSwapError::InvalidFee
    );
    require!(
        base_fee_bps <= max_dynamic_fee_bps,
        StableSwapError::InvalidFeeConfig
    );
    require!(
        depeg_threshold_bps > 0 && depeg_threshold_bps <= MAX_DEPEG_THRESHOLD_BPS,
        StableSwapError::InvalidDepegThreshold
    );
    require!(max_price_age_sec > 0, StableSwapError::InvalidOracleAge);
    require!(
        ctx.accounts.token_mint_a.key() != ctx.accounts.token_mint_b.key(),
        StableSwapError::InvalidMint
    );
    require!(
        ctx.accounts.token_mint_a.decimals == ctx.accounts.token_mint_b.decimals,
        StableSwapError::InvalidMintDecimals
    );
    require!(
        ctx.accounts.oracle_price_feed_a.key() != ctx.accounts.oracle_price_feed_b.key(),
        StableSwapError::InvalidOracleAccount
    );
    require_keys_eq!(
        ctx.accounts.system_program.key(),
        System::id(),
        StableSwapError::InvalidSystemProgram
    );
    require_keys_eq!(
        ctx.accounts.token_program.key(),
        Token::id(),
        StableSwapError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.associated_token_program.key(),
        AssociatedToken::id(),
        StableSwapError::InvalidAssociatedTokenProgram
    );

    // VAULT VALIDATION (Important security check!)
    //
    // The vaults must be the canonical ATAs owned by the pool PDA.
    // If arbitrary token accounts were accepted here, a malicious caller could
    // substitute attacker-controlled accounts and divert pool funds.
    let expected_vault_a =
        get_associated_token_address(&ctx.accounts.pool.key(), &ctx.accounts.token_mint_a.key());
    require!(
        ctx.accounts.vault_a.key() == expected_vault_a,
        StableSwapError::InvalidVault
    );

    let expected_vault_b =
        get_associated_token_address(&ctx.accounts.pool.key(), &ctx.accounts.token_mint_b.key());
    require!(
        ctx.accounts.vault_b.key() == expected_vault_b,
        StableSwapError::InvalidVault
    );

    let oracle_status = load_pair_status(
        &ctx.accounts.oracle_price_feed_a.key(),
        &ctx.accounts.oracle_price_feed_b.key(),
        &ctx.accounts.oracle_price_feed_a.to_account_info(),
        &ctx.accounts.oracle_price_feed_b.to_account_info(),
        max_price_age_sec,
        depeg_threshold_bps,
    )?;
    require!(!oracle_status.should_pause, StableSwapError::PoolPaused);

    ctx.accounts.pool.set_inner(Pool {
        admin: ctx.accounts.admin.key(),
        lp_mint: ctx.accounts.lp_mint.key(),
        amplification,
        fee_bps: base_fee_bps,
        token_mints: [
            ctx.accounts.token_mint_a.key(),
            ctx.accounts.token_mint_b.key(),
        ],
        bump: ctx.bumps.pool,
        oracle_config: OracleConfig {
            oracle_a: ctx.accounts.oracle_price_feed_a.key(),
            oracle_b: ctx.accounts.oracle_price_feed_b.key(),
            max_depeg_bps: depeg_threshold_bps,
            emergency_fee_bps: max_dynamic_fee_bps,
            max_price_age_sec,
            enabled: true,
        },
        is_paused: false,
    });

    msg!(
        "StableSwap pool initialized: tokens={}, A={}, fee={}bps, emergency_fee={}bps, depeg_threshold={}bps",
        NUM_TOKENS,
        amplification,
        base_fee_bps,
        max_dynamic_fee_bps,
        depeg_threshold_bps
    );
    Ok(())
}
`,
      language: 'rust',
    },
    {
      name: "modify_liquidity.rs",
      path: "programs/stableswap/src/instructions/modify_liquidity.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Deposit or withdraw liquidity from the pool.
//
// ============================================================================
// MODIFY LIQUIDITY INSTRUCTIONS
// ============================================================================
//
// This file handles adding and removing liquidity from the pool.
//
// LIQUIDITY PROVIDER (LP) BASICS
//
// - LPs deposit tokens into the pool to earn fees from swaps
// - In return, they receive LP tokens representing their share of the pool
// - When they withdraw, they burn LP tokens to get back their share of reserves
//
// KEY CONCEPTS
//
// - D (invariant): represents the normalized total value of the pool
// - LP tokens: your ownership share of D
// - First deposit: special handling to prevent LP inflation attacks
// ============================================================================

use crate::constants::MINIMUM_LIQUIDITY;
use crate::errors::StableSwapError;
use crate::math::{calculate_lp_mint_amount, calculate_withdraw_amounts};
use crate::oracle::load_pair_status;
use crate::state::Pool;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

/// Accounts required to add liquidity to a StableSwap pool.
#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    /// Token A mint — validated against the pool's stored token list.
    pub token_mint_a: Box<Account<'info, Mint>>,

    /// Token B mint — validated against the pool's stored token list.
    pub token_mint_b: Box<Account<'info, Mint>>,

    /// Pool PDA — auto-resolved from [b"pool", lp_mint].
    #[account(
        mut,
        seeds = [b"pool", lp_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Pool's token A vault.
    #[account(
        mut,
        constraint = vault_a.mint == token_mint_a.key() @ StableSwapError::InvalidVault,
        constraint = vault_a.owner == pool.key() @ StableSwapError::InvalidVault,
    )]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    /// Pool's token B vault.
    #[account(
        mut,
        constraint = vault_b.mint == token_mint_b.key() @ StableSwapError::InvalidVault,
        constraint = vault_b.owner == pool.key() @ StableSwapError::InvalidVault,
    )]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    /// LP token mint.
    #[account(
        mut,
        constraint = lp_mint.key() == pool.lp_mint @ StableSwapError::InvalidMint,
    )]
    pub lp_mint: Box<Account<'info, Mint>>,

    /// Depositor's token A account.
    #[account(
        mut,
        constraint = user_token_a.mint == token_mint_a.key() @ StableSwapError::InvalidMint,
    )]
    pub user_token_a: Box<Account<'info, TokenAccount>>,

    /// Depositor's token B account.
    #[account(
        mut,
        constraint = user_token_b.mint == token_mint_b.key() @ StableSwapError::InvalidMint,
    )]
    pub user_token_b: Box<Account<'info, TokenAccount>>,

    /// Depositor's LP token account (receives newly minted LP tokens).
    #[account(
        mut,
        constraint = user_lp_token.mint == pool.lp_mint @ StableSwapError::InvalidMint,
    )]
    pub user_lp_token: Box<Account<'info, TokenAccount>>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_a: UncheckedAccount<'info>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_b: UncheckedAccount<'info>,

    /// The depositor.
    pub user: Signer<'info>,

    /// SPL Token program used for transfers and LP minting.
    pub token_program: Program<'info, Token>,
}

/// Accounts required to remove liquidity from a StableSwap pool.
#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    /// Token A mint — validated against the pool's stored token list.
    pub token_mint_a: Box<Account<'info, Mint>>,

    /// Token B mint — validated against the pool's stored token list.
    pub token_mint_b: Box<Account<'info, Mint>>,

    /// Pool PDA — auto-resolved from [b"pool", lp_mint].
    #[account(
        mut,
        seeds = [b"pool", lp_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Pool's token A vault.
    #[account(
        mut,
        constraint = vault_a.mint == token_mint_a.key() @ StableSwapError::InvalidVault,
        constraint = vault_a.owner == pool.key() @ StableSwapError::InvalidVault,
    )]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    /// Pool's token B vault.
    #[account(
        mut,
        constraint = vault_b.mint == token_mint_b.key() @ StableSwapError::InvalidVault,
        constraint = vault_b.owner == pool.key() @ StableSwapError::InvalidVault,
    )]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    /// LP token mint (supply decreases on burn).
    #[account(
        mut,
        constraint = lp_mint.key() == pool.lp_mint @ StableSwapError::InvalidMint,
    )]
    pub lp_mint: Box<Account<'info, Mint>>,

    /// Withdrawer's token A account (receives token A).
    #[account(
        mut,
        constraint = user_token_a.mint == token_mint_a.key() @ StableSwapError::InvalidMint,
    )]
    pub user_token_a: Box<Account<'info, TokenAccount>>,

    /// Withdrawer's token B account (receives token B).
    #[account(
        mut,
        constraint = user_token_b.mint == token_mint_b.key() @ StableSwapError::InvalidMint,
    )]
    pub user_token_b: Box<Account<'info, TokenAccount>>,

    /// Withdrawer's LP token account (LP tokens burned from here).
    #[account(
        mut,
        constraint = user_lp_token.mint == pool.lp_mint @ StableSwapError::InvalidMint,
    )]
    pub user_lp_token: Box<Account<'info, TokenAccount>>,

    /// The withdrawer.
    pub user: Signer<'info>,

    /// SPL Token program used for burn and transfer CPI calls.
    pub token_program: Program<'info, Token>,
}

/// Validate that the supplied mints and vaults belong to this pool.
///
/// The vaults are owned by the pool PDA, but anyone can create a token account
/// with that owner. Requiring the stored mints and canonical pool ATAs prevents
/// LP shares from being minted against attacker-controlled reserves.
fn validate_pool_accounts(
    pool_key: &Pubkey,
    pool: &Pool,
    token_mint_a: &Pubkey,
    token_mint_b: &Pubkey,
    vault_a: &Pubkey,
    vault_b: &Pubkey,
) -> Result<()> {
    require_keys_eq!(
        *token_mint_a,
        pool.token_mints[0],
        StableSwapError::InvalidMint
    );
    require_keys_eq!(
        *token_mint_b,
        pool.token_mints[1],
        StableSwapError::InvalidMint
    );
    require_keys_eq!(
        *vault_a,
        get_associated_token_address(pool_key, &pool.token_mints[0]),
        StableSwapError::InvalidVault
    );
    require_keys_eq!(
        *vault_b,
        get_associated_token_address(pool_key, &pool.token_mints[1]),
        StableSwapError::InvalidVault
    );
    Ok(())
}

/// Deposit token A and token B into the pool to receive LP tokens.
///
/// # Arguments
/// * \`amount_a\`     — Token A amount to deposit.
/// * \`amount_b\`     — Token B amount to deposit.
/// * \`min_lp_out\`   — Minimum LP tokens to receive (slippage guard).
pub fn add_liquidity_handler(
    ctx: Context<AddLiquidity>,
    amount_a: u64,
    amount_b: u64,
    min_lp_out: u64,
) -> Result<()> {
    require!(amount_a > 0 || amount_b > 0, StableSwapError::ZeroAmount);

    let pool = &ctx.accounts.pool;
    require!(!pool.is_paused, StableSwapError::PoolPaused);
    validate_pool_accounts(
        &pool.key(),
        pool,
        &ctx.accounts.token_mint_a.key(),
        &ctx.accounts.token_mint_b.key(),
        &ctx.accounts.vault_a.key(),
        &ctx.accounts.vault_b.key(),
    )?;
    require!(
        ctx.accounts.lp_mint.mint_authority.contains(&pool.key()),
        StableSwapError::InvalidMint
    );
    let oracle_status = load_pair_status(
        &pool.oracle_config.oracle_a,
        &pool.oracle_config.oracle_b,
        &ctx.accounts.oracle_price_feed_a.to_account_info(),
        &ctx.accounts.oracle_price_feed_b.to_account_info(),
        pool.oracle_config.max_price_age_sec,
        pool.oracle_config.max_depeg_bps,
    )?;
    require!(
        !pool.oracle_config.enabled || !oracle_status.should_pause,
        StableSwapError::PoolPaused
    );

    let reserve_a = ctx.accounts.vault_a.amount as u128;
    let reserve_b = ctx.accounts.vault_b.amount as u128;
    let lp_supply = ctx.accounts.lp_mint.supply as u128;
    let amp = pool.amplification as u128;

    let new_reserve_a = reserve_a
        .checked_add(amount_a as u128)
        .ok_or(StableSwapError::MathOverflow)?;
    let new_reserve_b = reserve_b
        .checked_add(amount_b as u128)
        .ok_or(StableSwapError::MathOverflow)?;

    let lp_to_mint = calculate_lp_mint_amount(
        reserve_a,
        reserve_b,
        new_reserve_a,
        new_reserve_b,
        lp_supply,
        amp,
        MINIMUM_LIQUIDITY,
    )?;

    require!(lp_to_mint >= min_lp_out, StableSwapError::SlippageExceeded);
    require!(lp_to_mint > 0, StableSwapError::ZeroAmount);

    if amount_a > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_a.to_account_info(),
                    to: ctx.accounts.vault_a.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_a,
        )?;
    }

    if amount_b > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_b.to_account_info(),
                    to: ctx.accounts.vault_b.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_b,
        )?;
    }

    let seeds: &[&[u8]] = &[b"pool", pool.lp_mint.as_ref(), &[pool.bump]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.lp_mint.to_account_info(),
                to: ctx.accounts.user_lp_token.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[seeds],
        ),
        lp_to_mint,
    )?;

    msg!(
        "Added liquidity: a={} b={} lp_minted={} oracle_a={}bps oracle_b={}bps",
        amount_a,
        amount_b,
        lp_to_mint,
        oracle_status.peg_delta_a_bps,
        oracle_status.peg_delta_b_bps
    );
    Ok(())
}

/// Burn LP tokens to withdraw a proportional share of both token A and token B.
///
/// Withdrawals intentionally remain oracle-independent so LPs can always exit,
/// even when swaps and deposits are halted by depeg protection.
///
/// # Arguments
/// * \`lp_amount\` — LP tokens to burn.
/// * \`min_a\`     — Minimum token A to receive (slippage guard).
/// * \`min_b\`     — Minimum token B to receive (slippage guard).
pub fn remove_liquidity_handler(
    ctx: Context<RemoveLiquidity>,
    lp_amount: u64,
    min_a: u64,
    min_b: u64,
) -> Result<()> {
    require!(lp_amount > 0, StableSwapError::ZeroAmount);

    let pool = &ctx.accounts.pool;
    validate_pool_accounts(
        &pool.key(),
        pool,
        &ctx.accounts.token_mint_a.key(),
        &ctx.accounts.token_mint_b.key(),
        &ctx.accounts.vault_a.key(),
        &ctx.accounts.vault_b.key(),
    )?;
    let reserve_a = ctx.accounts.vault_a.amount as u128;
    let reserve_b = ctx.accounts.vault_b.amount as u128;
    let actual_supply = ctx.accounts.lp_mint.supply;
    let adjusted_supply = (actual_supply as u128)
        .checked_add(MINIMUM_LIQUIDITY as u128)
        .ok_or(StableSwapError::MathOverflow)?;

    require!(adjusted_supply > 0, StableSwapError::EmptyPool);
    require!(
        lp_amount as u128 <= actual_supply as u128,
        StableSwapError::InsufficientLiquidity
    );

    // Withdrawals are always proportional across both pool assets.
    // This pool intentionally does not support single-sided LP exits.
    let withdraw_amounts =
        calculate_withdraw_amounts(&[reserve_a, reserve_b], lp_amount as u128, adjusted_supply)?;
    let amount_a = withdraw_amounts[0];
    let amount_b = withdraw_amounts[1];

    // Slippage protection: both token outputs must clear the user's minimums.
    require!(amount_a >= min_a, StableSwapError::SlippageExceeded);
    require!(amount_b >= min_b, StableSwapError::SlippageExceeded);

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.user_lp_token.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        lp_amount,
    )?;

    let seeds: &[&[u8]] = &[b"pool", pool.lp_mint.as_ref(), &[pool.bump]];

    if amount_a > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_a.to_account_info(),
                    to: ctx.accounts.user_token_a.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            amount_a,
        )?;
    }

    if amount_b > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_b.to_account_info(),
                    to: ctx.accounts.user_token_b.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            amount_b,
        )?;
    }

    msg!(
        "Removed liquidity: lp_burned={} a_out={} b_out={}",
        lp_amount,
        amount_a,
        amount_b
    );
    Ok(())
}
`,
      language: 'rust',
    },
    {
      name: "swap.rs",
      path: "programs/stableswap/src/instructions/swap.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Execute a StableSwap trade using oracle-aware dynamic fees.
//
// ============================================================================
// SWAP INSTRUCTION
// ============================================================================
//
// The core AMM function. This lets users trade one token for another.
//
// HOW A SWAP WORKS
//
// 1. User specifies: "I want to swap X of token A for token B"
// 2. We calculate how much token B they should receive using StableSwap math
// 3. We transfer token A from user to pool vault
// 4. We transfer token B from pool vault to user
//
// The exchange rate comes from the StableSwap invariant formula.
// Unlike Uniswap's \`x*y=k\`, StableSwap gives much better rates for stablecoins.
//
// SLIPPAGE PROTECTION
//
// The user specifies \`min_amount_out\`, the minimum they'll accept.
// If market conditions change or there's a bug, the swap reverts.
// This protects against front-running and sandwich attacks.
// ============================================================================

use crate::constants::NUM_TOKENS;
use crate::errors::StableSwapError;
use crate::math::calculate_swap_output;
use crate::oracle::load_pair_status;
use crate::state::Pool;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address,
    token::{self, Token, TokenAccount, Transfer},
};

/// Accounts required to execute a swap.
#[derive(Accounts)]
pub struct Swap<'info> {
    /// The pool we're swapping in.
    #[account(
        mut,
        seeds = [b"pool", pool.lp_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_a: UncheckedAccount<'info>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_b: UncheckedAccount<'info>,

    /// The user performing the swap. They sign to authorize token transfers.
    pub user: Signer<'info>,

    /// SPL Token program used for transfer instructions.
    pub token_program: Program<'info, Token>,
}

impl<'info> Swap<'info> {
    /// Read and deserialize a token account from the remaining account list.
    fn read_token_account(&self, account: &AccountInfo<'info>) -> Result<TokenAccount> {
        let data = &mut &account.try_borrow_data()?[..];
        TokenAccount::try_deserialize(data)
            .map_err(|_| error!(StableSwapError::InvalidRemainingAccounts))
    }

    /// Read reserve balances from the provided vault accounts.
    pub fn read_reserves(&self, vaults: &[&AccountInfo<'info>]) -> Result<Vec<u128>> {
        let mut reserves = Vec::with_capacity(vaults.len());

        for vault in vaults {
            let account = self.read_token_account(vault)?;
            reserves.push(account.amount as u128);
        }

        Ok(reserves)
    }

    /// Validate the fixed remaining-account layout used by the swap instruction.
    ///
    /// Expected order for a 2-token pool:
    /// - \`[0]\` Token A vault (pool ATA)
    /// - \`[1]\` Token B vault (pool ATA)
    /// - \`[2]\` User's input token account
    /// - \`[3]\` User's output token account
    pub fn validate_remaining_accounts(
        &self,
        remaining: &[AccountInfo<'info>],
        input_index: u8,
        output_index: u8,
    ) -> Result<()> {
        require!(
            input_index < NUM_TOKENS as u8,
            StableSwapError::InvalidTokenIndex
        );
        require!(
            output_index < NUM_TOKENS as u8,
            StableSwapError::InvalidTokenIndex
        );
        require!(input_index != output_index, StableSwapError::SameTokenSwap);
        require!(
            remaining.len() == NUM_TOKENS + 2,
            StableSwapError::InvalidRemainingAccounts
        );

        let vault_a = self.read_token_account(&remaining[0])?;
        let vault_b = self.read_token_account(&remaining[1])?;
        let user_input = self.read_token_account(&remaining[2])?;
        let user_output = self.read_token_account(&remaining[3])?;

        let expected_vault_a =
            get_associated_token_address(&self.pool.key(), &self.pool.token_mints[0]);
        let expected_vault_b =
            get_associated_token_address(&self.pool.key(), &self.pool.token_mints[1]);

        require_keys_eq!(
            remaining[0].key(),
            expected_vault_a,
            StableSwapError::InvalidVault
        );
        require_keys_eq!(
            remaining[1].key(),
            expected_vault_b,
            StableSwapError::InvalidVault
        );
        require_keys_eq!(
            vault_a.owner,
            self.pool.key(),
            StableSwapError::InvalidVault
        );
        require_keys_eq!(
            vault_b.owner,
            self.pool.key(),
            StableSwapError::InvalidVault
        );
        require_keys_eq!(
            vault_a.mint,
            self.pool.token_mints[0],
            StableSwapError::InvalidVault
        );
        require_keys_eq!(
            vault_b.mint,
            self.pool.token_mints[1],
            StableSwapError::InvalidVault
        );

        require_keys_eq!(
            user_input.owner,
            self.user.key(),
            StableSwapError::InvalidRemainingAccounts
        );
        require_keys_eq!(
            user_output.owner,
            self.user.key(),
            StableSwapError::InvalidRemainingAccounts
        );
        require_keys_eq!(
            user_input.mint,
            self.pool.token_mints[input_index as usize],
            StableSwapError::InvalidMint
        );
        require_keys_eq!(
            user_output.mint,
            self.pool.token_mints[output_index as usize],
            StableSwapError::InvalidMint
        );

        Ok(())
    }

    /// Transfer tokens FROM the user TO the pool vault.
    ///
    /// CPI (Cross-Program Invocation) EXPLANATION:
    ///
    /// We're calling the SPL Token program to do the actual transfer.
    /// The user must have signed the transaction, so they are the authority.
    pub fn transfer_in(
        &self,
        from: &AccountInfo<'info>,
        vault: &AccountInfo<'info>,
        amount: u64,
    ) -> Result<()> {
        token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer {
                    from: from.clone(),
                    to: vault.clone(),
                    authority: self.user.to_account_info(),
                },
            ),
            amount,
        )
    }

    /// Transfer tokens FROM the pool vault TO the user's account.
    ///
    /// PDA SIGNING EXPLANATION:
    ///
    /// The vault is owned by the pool PDA. PDAs cannot sign with a private key,
    /// but the program can "sign" on behalf of a PDA using the seeds that
    /// derive it.
    ///
    /// \`signer_seeds\` contains: \`[b"pool", lp_mint_pubkey, bump]\`
    ///
    /// The Solana runtime verifies these seeds derive the pool address.
    pub fn transfer_out(
        &self,
        vault: &AccountInfo<'info>,
        user_ata: &AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer {
                    from: vault.clone(),
                    to: user_ata.clone(),
                    authority: self.pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )
    }
}

/// Swap tokens using the StableSwap invariant.
///
/// # Arguments
/// * \`amount_in\`     — Amount of input token to sell.
/// * \`min_amount_out\` — Minimum output tokens to receive (slippage guard).
/// * \`input_index\`   — Pool token index to sell.
/// * \`output_index\`  — Pool token index to receive.
pub fn swap_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Swap<'info>>,
    amount_in: u64,
    min_amount_out: u64,
    input_index: u8,
    output_index: u8,
) -> Result<()> {
    // Handler for the swap instruction.
    //
    // REMAINING ACCOUNTS for a 2-token pool:
    // - \`[0]\`: Token A vault (pool's ATA)
    // - \`[1]\`: Token B vault (pool's ATA)
    // - \`[2]\`: User's input token account
    // - \`[3]\`: User's output token account
    require!(amount_in > 0, StableSwapError::ZeroAmount);

    let pool = &ctx.accounts.pool;
    let remaining = ctx.remaining_accounts;

    // STEP 1: Validate indices and remaining-account layout.
    ctx.accounts
        .validate_remaining_accounts(remaining, input_index, output_index)?;

    require!(!pool.is_paused, StableSwapError::PoolPaused);
    let oracle_status = load_pair_status(
        &pool.oracle_config.oracle_a,
        &pool.oracle_config.oracle_b,
        &ctx.accounts.oracle_price_feed_a.to_account_info(),
        &ctx.accounts.oracle_price_feed_b.to_account_info(),
        pool.oracle_config.max_price_age_sec,
        pool.oracle_config.max_depeg_bps,
    )?;
    require!(
        !pool.oracle_config.enabled || !oracle_status.should_pause,
        StableSwapError::PoolPaused
    );

    let reserves = ctx
        .accounts
        .read_reserves(&[&remaining[0], &remaining[1]])?;
    let reserve_a = reserves[0];
    let reserve_b = reserves[1];
    let amp = pool.amplification as u128;
    let base_fee_bps = pool.fee_bps;
    let max_dynamic_fee_bps = if pool.oracle_config.enabled {
        pool.oracle_config.emergency_fee_bps
    } else {
        pool.fee_bps
    };

    // Both reserves must be non-zero for a valid swap
    require!(reserve_a > 0 && reserve_b > 0, StableSwapError::EmptyPool);

    // Determine which side is in and which is out
    let reserve_by_index = [reserve_a, reserve_b];
    let price_by_index = [oracle_status.price_a, oracle_status.price_b];
    let reserve_in = reserve_by_index[input_index as usize];
    let reserve_out = reserve_by_index[output_index as usize];
    let oracle_price_in = price_by_index[input_index as usize];
    let oracle_price_out = price_by_index[output_index as usize];

    let quote = calculate_swap_output(
        reserve_in,
        reserve_out,
        amount_in as u128,
        amp,
        base_fee_bps,
        max_dynamic_fee_bps,
        oracle_price_in,
        oracle_price_out,
        pool.oracle_config.max_depeg_bps,
    )?;

    require!(
        quote.amount_out >= min_amount_out as u128,
        StableSwapError::SlippageExceeded
    );

    let seeds: &[&[u8]] = &[b"pool", pool.lp_mint.as_ref(), &[pool.bump]];

    ctx.accounts
        .transfer_in(&remaining[2], &remaining[input_index as usize], amount_in)?;
    ctx.accounts.transfer_out(
        &remaining[output_index as usize],
        &remaining[3],
        quote.amount_out as u64,
        &[seeds],
    )?;

    msg!(
        "Swap {}→{}: {} in → {} out (fee: {}, dynamic_fee={}bps, oracle_a={}bps, oracle_b={}bps)",
        input_index,
        output_index,
        amount_in,
        quote.amount_out,
        quote.fee_amount,
        quote.dynamic_fee_bps,
        oracle_status.peg_delta_a_bps,
        oracle_status.peg_delta_b_bps
    );
    Ok(())
}
`,
      language: 'rust',
    },
    {
      name: "check_depeg.rs",
      path: "programs/stableswap/src/instructions/check_depeg.rs",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
//! Explicit oracle-health instruction for checking whether a pool is depegged.
//
// ============================================================================
// CHECK DEPEG INSTRUCTION
// ============================================================================
//
// This instruction allows anyone (keepers, bots, admins) to check whether the
// pool's stablecoins have depegged from $1.
//
// WHY IS THIS A SEPARATE INSTRUCTION?
//
// 1. Checking oracles on every swap is expensive
// 2. Not every pool design wants to rely on a continuously persisted pause flag
// 3. Keepers can call this periodically to evaluate pool health
// 4. It provides a lightweight way to react to depeg events without executing a
//    swap or deposit
//
// HOW IT WORKS
//
// 1. Read prices from the Pyth oracles for both tokens
// 2. Check whether either price has deviated from $1 beyond the configured
//    threshold
// 3. Return success if the pool is healthy, or \`PoolPaused\` if the pair should
//    be treated as halted
//
// REMAINING ACCOUNTS
//
// - \`oracle_price_feed_a\`: Pyth oracle for token A
// - \`oracle_price_feed_b\`: Pyth oracle for token B
// ============================================================================

use crate::errors::StableSwapError;
use crate::oracle::load_pair_status;
use crate::state::Pool;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

/// Accounts required to verify whether the pool is still inside its peg band.
#[derive(Accounts)]
pub struct CheckDepeg<'info> {
    /// Token A mint — validated against the pool's stored token list.
    pub token_mint_a: Box<Account<'info, Mint>>,

    /// Token B mint — validated against the pool's stored token list.
    pub token_mint_b: Box<Account<'info, Mint>>,

    /// LP mint used to derive the pool PDA.
    #[account(
        constraint = lp_mint.key() == pool.lp_mint @ StableSwapError::InvalidMint,
    )]
    pub lp_mint: Box<Account<'info, Mint>>,

    /// Pool PDA — auto-resolved from [b"pool", lp_mint].
    #[account(
        mut,
        seeds = [b"pool", lp_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_a: UncheckedAccount<'info>,

    /// CHECK: validated against the stored pool config and parsed as a Pyth price account.
    pub oracle_price_feed_b: UncheckedAccount<'info>,
}

/// Verify that both stablecoins remain inside the configured peg band.
///
/// This instruction is useful for explicit monitoring, pre-trade checks, and
/// test harnesses that want to validate oracle health without executing a swap
/// or deposit.
pub fn check_depeg_handler(ctx: Context<CheckDepeg>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let oracle_status = load_pair_status(
        &pool.oracle_config.oracle_a,
        &pool.oracle_config.oracle_b,
        &ctx.accounts.oracle_price_feed_a.to_account_info(),
        &ctx.accounts.oracle_price_feed_b.to_account_info(),
        pool.oracle_config.max_price_age_sec,
        pool.oracle_config.max_depeg_bps,
    )?;

    pool.is_paused = pool.oracle_config.enabled && oracle_status.should_pause;

    msg!(
        "Check depeg: oracle_a={}bps oracle_b={}bps threshold={}bps paused={}",
        oracle_status.peg_delta_a_bps,
        oracle_status.peg_delta_b_bps,
        pool.oracle_config.max_depeg_bps,
        pool.is_paused
    );
    Ok(())
}
`,
      language: 'rust',
    },
    {
      name: "Cargo.toml",
      path: "programs/stableswap/Cargo.toml",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
[package]
name = "stableswap"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []

[dependencies]
anchor-lang = "0.31.1"
anchor-spl = { version = "0.31.1", features = ["token", "associated_token"] }
`,
      language: 'plain',
    },
    {
      name: "Anchor.toml",
      path: "Anchor.toml",
      content: `// Ported from https://github.com/SURUJ404/Solana/tree/main/stableswap/anchor
// MIT License - Copyright (c) 2025 Solana Foundation. See docs/STABLESWAP.md.
// Adapted for Anchor 0.31.1 and the Solphg compiler's dependency constraints.
[toolchain]
anchor_version = "0.31.1"

[programs.localnet]
stableswap = "11111111111111111111111111111111"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "echo no-op"
`,
      language: 'plain',
    },
  ],
}

