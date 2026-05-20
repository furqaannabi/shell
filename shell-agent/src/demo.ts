import "dotenv/config";
import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { postIoi } from "./ioi.js";
import { evaluateProposal } from "./llm.js";
import { pollProposals } from "./proposals.js";
import { submitOrderFromProposal } from "./orders.js";

const SEAL_KEY_SERVER = {
  objectId:
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  weight: 1,
};

const POLL_MS = 5_000;
const TIMEOUT_MS = 5 * 60_000;
const FLOAT = 1_000_000_000n;

function makeSui() {
  return new SuiJsonRpcClient({ url: config.suiRpcUrl, network: "testnet" });
}

function makeSeal(sui: SuiJsonRpcClient) {
  return new SealClient({
    suiClient: sui as never,
    serverConfigs: [SEAL_KEY_SERVER],
    verifyKeyServers: false,
  });
}

/** Full end-to-end demo: two wallets post overlapping IOIs, enclave matches,
 *  both sides auto-accept. No human interaction required. */
export async function runDemo(): Promise<void> {
  const buyerKey = process.env.DEMO_BUYER_KEY;
  const sellerKey = process.env.DEMO_SELLER_KEY;
  if (!buyerKey || !sellerKey) {
    throw new Error(
      "Set DEMO_BUYER_KEY and DEMO_SELLER_KEY in .env (both funded testnet wallets)",
    );
  }

  const buyerKp = Ed25519Keypair.fromSecretKey(buyerKey);
  const sellerKp = Ed25519Keypair.fromSecretKey(sellerKey);
  const buyerAddr = buyerKp.toSuiAddress();
  const sellerAddr = sellerKp.toSuiAddress();

  console.log(`[demo] buyer  ${buyerAddr}`);
  console.log(`[demo] seller ${sellerAddr}`);

  const buyerSui = makeSui();
  const sellerSui = makeSui();
  const buyerSeal = makeSeal(buyerSui);
  const sellerSeal = makeSeal(sellerSui);

  const sys = await buyerSui.getLatestSuiSystemState();
  const expiryEpoch = BigInt(sys.epoch) + 10n;

  // Overlapping terms:
  //   Buyer: 2–4 SUI @ 1.80–2.20 DUSDC
  //   Seller: 2–4 SUI @ 1.90–2.10 DUSDC
  //   Enclave midpoint: 2.00 DUSDC, 2 SUI
  const asset = "0x2::sui::SUI";
  const ttlMs = BigInt(Date.now()) + 30n * 60_000n;

  console.log("[demo] posting Buy + Sell IOIs…");
  const [buyResult, sellResult] = await Promise.all([
    postIoi({
      suiClient: buyerSui,
      sealClient: buyerSeal,
      keypair: buyerKp,
      plaintext: {
        side: "buy",
        asset,
        sizeLo: 2n * FLOAT,
        sizeHi: 4n * FLOAT,
        priceLo: 1_800_000_000n,
        priceHi: 2_200_000_000n,
        expiryMs: ttlMs,
      },
      expiryEpoch,
    }),
    postIoi({
      suiClient: sellerSui,
      sealClient: sellerSeal,
      keypair: sellerKp,
      plaintext: {
        side: "sell",
        asset,
        sizeLo: 2n * FLOAT,
        sizeHi: 4n * FLOAT,
        priceLo: 1_900_000_000n,
        priceHi: 2_100_000_000n,
        expiryMs: ttlMs,
      },
      expiryEpoch,
    }),
  ]);

  console.log(`[demo] buy  IOI: blob=${buyResult.blobId} tx=${buyResult.digest}`);
  console.log(`[demo] sell IOI: blob=${sellResult.blobId} tx=${sellResult.digest}`);
  console.log("[demo] waiting for enclave match (timeout 5 min)…");

  const buyerSeen = new Set<string>();
  const sellerSeen = new Set<string>();
  let buyerDone = false;
  let sellerDone = false;
  const deadline = Date.now() + TIMEOUT_MS;

  while (!(buyerDone && sellerDone)) {
    if (Date.now() > deadline) {
      console.error("[demo] timeout — enclave did not match within 5 min");
      console.error("[demo] check: Move package upgraded? Enclave running?");
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));

    if (!buyerDone) {
      const { proposals } = await pollProposals({
        suiClient: buyerSui,
        agentAddr: buyerAddr,
      });
      for (const p of proposals) {
        if (buyerSeen.has(p.blobId)) continue;
        buyerSeen.add(p.blobId);
        console.log(
          `[demo] buyer proposal: price=${p.agreedPrice} size=${p.agreedSize}`,
        );
        const buyDecision = await evaluateProposal(p);
        console.log(
          `[demo] buyer LLM: ${buyDecision.decision} (policy_ok=${buyDecision.policy_check}) — ${buyDecision.reasoning}`,
        );
        if (buyDecision.decision !== "accept_match" || !buyDecision.policy_check) {
          console.log("[demo] buyer rejected by LLM — skipping");
          continue;
        }
        const digest = await submitOrderFromProposal({
          suiClient: buyerSui,
          sealClient: buyerSeal,
          keypair: buyerKp,
          proposal: p,
        });
        console.log(`[demo] buyer order submitted: ${digest}`);
        buyerDone = true;
      }
    }

    if (!sellerDone) {
      const { proposals } = await pollProposals({
        suiClient: sellerSui,
        agentAddr: sellerAddr,
      });
      for (const p of proposals) {
        if (sellerSeen.has(p.blobId)) continue;
        sellerSeen.add(p.blobId);
        console.log(
          `[demo] seller proposal: price=${p.agreedPrice} size=${p.agreedSize}`,
        );
        const sellDecision = await evaluateProposal(p);
        console.log(
          `[demo] seller LLM: ${sellDecision.decision} (policy_ok=${sellDecision.policy_check}) — ${sellDecision.reasoning}`,
        );
        if (sellDecision.decision !== "accept_match" || !sellDecision.policy_check) {
          console.log("[demo] seller rejected by LLM — skipping");
          continue;
        }
        const digest = await submitOrderFromProposal({
          suiClient: sellerSui,
          sealClient: sellerSeal,
          keypair: sellerKp,
          proposal: p,
        });
        console.log(`[demo] seller order submitted: ${digest}`);
        sellerDone = true;
      }
    }
  }

  console.log("[demo] both orders submitted — IOI exchange complete");
}
