import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { BlueshiftAnchorEscrow } from "../target/types/blueshift_anchor_escrow";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("blueshift_anchor_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const program = anchor.workspace.BlueshiftAnchorEscrow as Program<BlueshiftAnchorEscrow>;

  let maker: Keypair;
  let taker: Keypair;
  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerAtaA: PublicKey;
  let makerAtaB: PublicKey;
  let takerAtaA: PublicKey;
  let takerAtaB: PublicKey;
  let escrow: PublicKey;
  let vault: PublicKey;

  const seedValue = new BN(8888);
  const receiveAmount = new BN(1_000_000);
  const amount = new BN(1_000_000);

  async function confirm(signature: string): Promise<string> {
    const block = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...block,
    });
    return signature;
  }

  async function log(signature: string): Promise<string> {
    console.log(
      ` Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
    );
    return signature;
  }

  before(async () => {
    maker = Keypair.generate();
    taker = Keypair.generate();

    const transferMaker = SystemProgram.transfer({
      fromPubkey: provider.publicKey,
      toPubkey: maker.publicKey,
      lamports: 10 * LAMPORTS_PER_SOL
    });

    const transferTaker = SystemProgram.transfer({
      fromPubkey: provider.publicKey,
      toPubkey: taker.publicKey,
      lamports: 10 * LAMPORTS_PER_SOL
    });
    
    const tx = new Transaction().add(transferMaker, transferTaker);
    await provider.sendAndConfirm(tx);

    mintA = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      6
    );

    mintB = await createMint(
      provider.connection,
      taker,
      taker.publicKey,
      null,
      6
    );

    escrow = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        seedValue.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    const makerMintAAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      maker,
      mintA,
      maker.publicKey
    );
    makerAtaA = makerMintAAccount.address;

    const takerMintBAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      taker,
      mintB,
      taker.publicKey
    );
    takerAtaB = takerMintBAccount.address;

    await mintTo(
      provider.connection,
      maker,
      mintA,
      makerAtaA,
      maker.publicKey,
      amount.toNumber()
    );

    await mintTo(
      provider.connection,
      taker,
      mintB,
      takerAtaB,
      taker.publicKey,
      receiveAmount.toNumber()
    );

    vault = getAssociatedTokenAddressSync(mintA, escrow, true);
    takerAtaA = getAssociatedTokenAddressSync(mintA, taker.publicKey, false);
    makerAtaB = getAssociatedTokenAddressSync(mintB, maker.publicKey, false);
  });

  it("Creates escrow and deposits tokens", async () => {
    const tx = await program.methods
      .make(seedValue, receiveAmount, amount)
      .accountsPartial({
        maker: maker.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow,
        vault: vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    await confirm(tx);
    await log(tx);

    const vaultAccount = await getAccount(connection, vault);
    expect(vaultAccount.amount).to.equal(BigInt(amount.toNumber()));
  });

  it("Takes the escrow and completes the swap", async () => {
    const tx = await program.methods
      .take()
      .accountsPartial({
        taker: taker.publicKey,
        maker: maker.publicKey,
        escrow: escrow,
        mintA: mintA,
        mintB: mintB,
        vault: vault,
        takerAtaA: takerAtaA,
        takerAtaB: takerAtaB,
        makerAtaB: makerAtaB,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([taker,maker])
      .rpc();

    await confirm(tx);
    await log(tx);

    const takerAtaAAccount = await getAccount(connection, takerAtaA);
    expect(takerAtaAAccount.amount).to.equal(BigInt(amount.toNumber()));

    const makerAtaBAccount = await getAccount(connection, makerAtaB);
    expect(makerAtaBAccount.amount).to.equal(BigInt(receiveAmount.toNumber()));

    try {
      await program.account.escrow.fetch(escrow);
      expect.fail("Escrow account should be closed");
    } catch (error) {
      expect(error.message).to.include("Account does not exist");
    }
  });

    it("reund amount and deposits tokens", async () => {
    const tx = await program.methods
      .refund()
      .accountsPartial({
        maker: maker.publicKey,
        mintA: mintA,
        makerAtaA: makerAtaA,
        escrow: escrow,
        vault: vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    await confirm(tx);
    await log(tx);

    const vaultAccount = await getAccount(connection, vault);
    expect(vaultAccount.amount).to.equal(BigInt(amount.toNumber()));
  });

});