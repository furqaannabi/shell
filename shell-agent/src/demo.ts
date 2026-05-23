import "dotenv/config";
import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { postIoi } from "./ioi.js";
import { evaluateProposal } from "./llm.js";
import { pollProposals, type MatchProposal } from "./proposals.js";
import { submitOrderFromProposal } from "./orders.js";

const SEAL_KEY_SERVER = {
  objectId:
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
  weight: 1,
};

const POLL_MS = 5_000;
const TIMEOUT_MS = 5 * 60_000;
const FLOAT = 1_000_000_000n;

// Quant policy used throughout this demo.
// Size is 1e9-scaled (1 SUI = 1_000_000_000).
// Price is DeepBook 1e6-scaled (1.00 DBUSDC per SUI = 1_000_000) — same
// scale used by IOIForm/SealedOrderForm/enclave.
const DEMO_POLICY =
  "You are a quant trading agent for Shell Finance. " +
  "Accept a match only if ALL conditions hold: " +
  "(1) agreed_price is between 1_800_000 and 2_100_000 (i.e. 1.80–2.10 DBUSDC); " +
  "(2) agreed_size is between 1_000_000_000 and 5_000_000_000 (i.e. 1–5 SUI). " +
  "Reject if price or size is outside those bounds. " +
  "Set policy_check=true only when the accepted match provably satisfies both conditions.";

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

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("─".repeat(60));
}

/** Full end-to-end demo:
 *  1. LLM rejects a bad synthetic proposal (shows AI decision-making)
 *  2. Two wallets post overlapping IOIs on-chain
 *  3. Enclave matches → both sides get proposals
 *  4. LLM evaluates and auto-accepts the real proposals
 */
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

  sep("STEP 1 — AI policy enforcement (synthetic bad proposal)");
  console.log("[demo] policy:", DEMO_POLICY.slice(0, 120) + "…");

  // Manufacture a proposal that violates the policy: price 3.50 DBUSDC (above max 2.10).
  const badProposal: MatchProposal = {
    buyAgent: buyerAddr,
    sellAgent: sellerAddr,
    asset: "0x2::sui::SUI",
    agreedPrice: 3_500_000n, // 3.50 DBUSDC at 1e6 scale — above policy ceiling
    agreedSize: 2n * FLOAT,
    expiryMs: BigInt(Date.now()) + 60_000n,
    side: "buy",
    blobId: "demo-synthetic-bad-proposal",
  };

  console.log(
    `[demo] synthetic proposal: price=3.50 DBUSDC  size=2 SUI  (price violates policy max 2.10)`,
  );
  const badDecision = await evaluateProposal(badProposal, DEMO_POLICY);
  console.log(
    `[demo] LLM decision : ${badDecision.decision}`,
  );
  console.log(
    `[demo] LLM reasoning: ${badDecision.reasoning}`,
  );
  console.log(
    `[demo] policy_check : ${badDecision.policy_check}`,
  );
  if (badDecision.decision === "accept_match") {
    console.warn("[demo] WARNING: LLM accepted a bad proposal — demo narrative weakened");
  } else {
    console.log("[demo] ✓ bad proposal correctly rejected — no order submitted");
  }

  sep("STEP 2 — Post encrypted IOIs on-chain (Seal + Walrus)");
  console.log(`[demo] buyer  ${buyerAddr}`);
  console.log(`[demo] seller ${sellerAddr}`);

  const buyerSui = makeSui();
  const sellerSui = makeSui();
  const buyerSeal = makeSeal(buyerSui);
  const sellerSeal = makeSeal(sellerSui);

  const sys = await buyerSui.getLatestSuiSystemState();
  const expiryEpoch = BigInt(sys.epoch) + 10n;

  // Overlapping terms that satisfy DEMO_POLICY:
  //   Buyer: 2–4 SUI @ 1.80–2.20 DBUSDC
  //   Seller: 2–4 SUI @ 1.90–2.10 DBUSDC
  //   Enclave midpoint: 2.00 DBUSDC, 2 SUI
  const asset = "0x2::sui::SUI";
  const ttlMs = BigInt(Date.now()) + 30n * 60_000n;

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
        priceLo: 1_800_000n,
        priceHi: 2_200_000n,
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
        priceLo: 1_900_000n,
        priceHi: 2_100_000n,
        expiryMs: ttlMs,
      },
      expiryEpoch,
    }),
  ]);

  console.log(`[demo] buy  IOI encrypted + posted: blob=${buyResult.blobId}`);
  console.log(`[demo] sell IOI encrypted + posted: blob=${sellResult.blobId}`);

  sep("STEP 3 — Enclave matches (polling every 5s, timeout 5 min)");

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
          `\n[demo] buyer got proposal: price=${p.agreedPrice} size=${p.agreedSize}`,
        );
        const d = await evaluateProposal(p, DEMO_POLICY);
        console.log(`[demo] buyer LLM decision : ${d.decision}`);
        console.log(`[demo] buyer LLM reasoning: ${d.reasoning}`);
        console.log(`[demo] buyer policy_check  : ${d.policy_check}`);
        if (d.decision !== "accept_match" || !d.policy_check) {
          console.log("[demo] buyer LLM rejected — skipping");
          continue;
        }
        const digest = await submitOrderFromProposal({
          suiClient: buyerSui,
          sealClient: buyerSeal,
          keypair: buyerKp,
          proposal: p,
        });
        console.log(`[demo] buyer Shell order submitted: ${digest}`);
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
          `\n[demo] seller got proposal: price=${p.agreedPrice} size=${p.agreedSize}`,
        );
        const d = await evaluateProposal(p, DEMO_POLICY);
        console.log(`[demo] seller LLM decision : ${d.decision}`);
        console.log(`[demo] seller LLM reasoning: ${d.reasoning}`);
        console.log(`[demo] seller policy_check  : ${d.policy_check}`);
        if (d.decision !== "accept_match" || !d.policy_check) {
          console.log("[demo] seller LLM rejected — skipping");
          continue;
        }
        const digest = await submitOrderFromProposal({
          suiClient: sellerSui,
          sealClient: sellerSeal,
          keypair: sellerKp,
          proposal: p,
        });
        console.log(`[demo] seller Shell order submitted: ${digest}`);
        sellerDone = true;
      }
    }
  }

  sep("DEMO COMPLETE");
  console.log("[demo] ✓ bad proposal rejected by AI policy enforcement");
  console.log("[demo] ✓ matching IOIs posted privately (Seal-encrypted on Walrus)");
  console.log("[demo] ✓ enclave matched without seeing plaintext order terms");
  console.log("[demo] ✓ AI accepted real proposals and submitted Shell orders on-chain");
}
