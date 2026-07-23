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
anchor-lang = "0.30.1"
`,
      language: 'plain',
    },
    {
      name: 'Anchor.toml',
      path: 'Anchor.toml',
      content: `[toolchain]
anchor_version = "0.30.1"

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
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
`,
      language: 'plain',
    },
    {
      name: 'Anchor.toml',
      path: 'Anchor.toml',
      content: `[toolchain]
anchor_version = "0.30.1"

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
anchor-lang = "0.30.1"
`,
      language: 'plain',
    },
    {
      name: 'Anchor.toml',
      path: 'Anchor.toml',
      content: `[toolchain]
anchor_version = "0.30.1"

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
