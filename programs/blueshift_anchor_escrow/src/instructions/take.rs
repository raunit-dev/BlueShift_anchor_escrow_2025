use anchor_lang::
    prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use anchor_spl::token_interface::{CloseAccount, close_account};

use crate::state::Escrow;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct Take<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,
    #[account(mut)]
    pub maker: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"escrow",maker.key().as_ref(),escrow.seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
        has_one = maker @ EscrowError::InvalidMaker,
        has_one = mint_a @ EscrowError::InvalidMintA,
        has_one = mint_b @ EscrowError::InvalidMintB,
    )]
    pub escrow: Account<'info,Escrow>,

    pub mint_a: Box<InterfaceAccount<'info,Mint>>,
    pub mint_b: Box<InterfaceAccount<'info,Mint>>,
    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority  = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info,TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata_a: InterfaceAccount<'info,TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = taker,
        associated_token::token_program = token_program,
    )]
    pub taker_ata_b: InterfaceAccount<'info,TokenAccount>,
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_b,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata_b: InterfaceAccount<'info,TokenAccount>,
        #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_a,
        associated_token::authority = taker,
        associated_token::token_program = token_program,
    )]
    pub taker_ata_a: InterfaceAccount<'info,TokenAccount>,
    pub associated_token_program: Program<'info,AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> Take <'info> {
   fn transfer_to_maker(&mut self) -> Result<()> {
    transfer_checked(
        CpiContext::new(
            self.token_program.to_account_info(),
            TransferChecked {
                from: self.taker_ata_b.to_account_info(),
                to: self.maker_ata_b.to_account_info(),
                mint: self.mint_b.to_account_info(),
                authority: self.taker.to_account_info(),
            },
        ),
        self.escrow.recieve,
        self.mint_b.decimals
    )?;
    Ok(())
   }

  fn withdraw_and_close_vault(&mut self) -> Result<()> {
    
     let seeds = &[
        b"escrow",
        self.maker.to_account_info().key.as_ref(),
        &self.escrow.seed.to_le_bytes()[..],
        &[self.escrow.bump],
     ];

     let signer_seeds = &[&seeds[..]];

     let accounts = TransferChecked {
        from: self.vault.to_account_info(),
        to: self.mint_a.to_account_info(),
        mint: self.mint_a.to_account_info(),
        authority: self.escrow.to_account_info(),
     };

     let ctx = CpiContext::new_with_signer(
        self.token_program.to_account_info(),
        accounts,
        signer_seeds
     );
     transfer_checked(ctx, self.vault.amount, self.mint_a.decimals)?;

     let accounts = CloseAccount {
        account: self.vault.to_account_info(),
        destination: self.taker.to_account_info(),
        authority: self.escrow.to_account_info(),
     };

     let ctx = CpiContext::new_with_signer(
        self.token_program.to_account_info(),
        accounts,
        signer_seeds,
     );

     close_account(ctx)
  }


    pub fn handler(ctx: Context<Take>) -> Result<()> {
       ctx.accounts.transfer_to_maker()?;
       ctx.accounts.withdraw_and_close_vault()?;
       Ok(())
    }
}