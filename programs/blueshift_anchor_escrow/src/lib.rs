
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
 
mod state;
mod errors;
mod instructions;
use instructions::*;
 
declare_id!("22222222222222222222222222222222222222222222");
 
#[program]
pub mod blueshift_anchor_escrow {
    use super::*;
 
    #[instruction(discriminator = 0)]
    pub fn make(ctx: Context<Make>, seed: u64, recieve: u64, amount: u64) -> Result<()> {
           handler_make(ctx, seed, recieve, amount)
    }
 
    #[instruction(discriminator = 1)]
    pub fn take(ctx: Context<Take>) -> Result<()> {
        handler_take(ctx)
    }
 
    #[instruction(discriminator = 2)]
     pub fn refund(ctx: Context<Refund>) -> Result<()> {
        handler_refund(ctx)
    }
}