import { Keypair } from "@solana/web3.js";

const kp = Keypair.generate();
const hex = Buffer.from(kp.secretKey).toString("hex");

console.log(`Faucet address: ${kp.publicKey.toBase58()}`);
console.log(`FAUCET_SECRET_KEY=${hex}`);
console.log("");
console.log("1. Set FAUCET_SECRET_KEY in Railway dashboard");
console.log(`2. Fund the faucet wallet at https://faucet.solana.com with the address above`);
console.log("3. The /api/airdrop endpoint will use this wallet to send SOL to users");
