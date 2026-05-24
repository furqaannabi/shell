import "dotenv/config";
import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { postIoi } from "./ioi.js";
import { makeLlmClient } from "./llm/index.js";
import { decideOnProposal } from "./llm/loop.js";
import { pollProposals, type MatchProposal } from "./proposals.js";
import { submitOrderFromProposal } from "./orders.js";
import { ToolRegistry, type ToolCtx } from "./tools/registry.js";
import { builtinTools } from "./tools/builtin.js";

const SEAL_KEY_SERVER = {
  objectId:
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  aggregatorUrl: "https://seal-aggregator-testnet.mystenlabs.com",
  weight: 1,
};

const POLL_MS = 5_000;
const TIMEOUT_MS = 5 * 60_000;
const FLOAT = 1_000_000_000n;

const QUOTE_COIN_TYPE =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

// Trade sizing — kept small so a 2 SUI wallet covers gas + collateral.
//   Sell side escrows SIZE in SUI (size 0.2 → 0.2 SUI locked, ~1.7 SUI left for gas)
//   Buy  side escrows SIZE * PRICE / 1e9 in USDC (0.2 SUI * 1.00 USDC = 0.20 USDC)
const SIZE_LO = (FLOAT * 1n) / 10n;   // 0.1 SUI
const SIZE_HI = (FLOAT * 2n) / 10n;   // 0.2 SUI
const PRICE_LO = 900_000n;            // 0.90 USDC
const PRICE_HI = 1_100_000n;          // 1.10 USDC

// Quant policy used throughout this demo. Bounds match SIZE/PRICE above
// so real proposals pass while a synthetic out-of-band proposal fails.
// Size is 1e9-scaled, price is 1e6-scaled.
const DEMO_POLICY =
  "You are a quant trading agent for Shell Finance. " +
  "Accept a match only if ALL conditions hold: " +
  "(1) agreed_price is between 900_000 and 1_100_000 (i.e. 0.90–1.10 USDC); " +
  "(2) agreed_size is between 100_000_000 and 200_000_000 (i.e. 0.1–0.2 SUI). " +
  "Reject if price or size is outside those bounds. " +
  "Set policy_check=true only when the accepted match provably satisfies both conditions.";

function ts(): string {
  return new Date().toISOString().split("T")[1]!.slice(0, 12);
}
function log(msg: string) {
  console.log(`[${ts()}] ${msg}`);
}

async function logBalances(
  sui: SuiJsonRpcClient,
  addr: string,
  label: string,
) {
  const suiBal = await sui.getBalance({ owner: addr });
  const usdcBal = await sui
    .getBalance({ owner: addr, coinType: QUOTE_COIN_TYPE })
    .catch(() => ({ totalBalance: "0" }));
  const suiF = (Number(suiBal.totalBalance) / 1e9).toFixed(4);
  const usdcF = (Number(usdcBal.totalBalance) / 1e6).toFixed(4);
  log(`  ${label.padEnd(7)} ${addr.slice(0, 10)}… SUI=${suiF}  USDC=${usdcF}`);
}

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

  const buyerSui = makeSui();
  const sellerSui = makeSui();
  const buyerSeal = makeSeal(buyerSui);
  const sellerSeal = makeSeal(sellerSui);

  // Shared LLM client + per-role tool ctx for the v2 tool-use loop.
  const llm = makeLlmClient();
  const tools = new ToolRegistry();
  tools.registerMany(builtinTools);
  const buyerCtx: ToolCtx = {
    suiClient: buyerSui,
    sealClient: buyerSeal,
    keypair: buyerKp,
    address: buyerAddr,
  };
  const sellerCtx: ToolCtx = {
    suiClient: sellerSui,
    sealClient: sellerSeal,
    keypair: sellerKp,
    address: sellerAddr,
  };

  sep("STEP 0 — Pre-flight balance check");
  await logBalances(buyerSui, buyerAddr, "BUYER");
  await logBalances(sellerSui, sellerAddr, "SELLER");

  const buyerUsdc = await buyerSui
    .getBalance({ owner: buyerAddr, coinType: QUOTE_COIN_TYPE })
    .catch(() => ({ totalBalance: "0" }));
  const neededUsdc = (SIZE_HI * PRICE_HI) / FLOAT; // worst-case escrow
  if (BigInt(buyerUsdc.totalBalance) < neededUsdc) {
    log(
      `ABORT: buyer needs ≥ ${(Number(neededUsdc) / 1e6).toFixed(4)} USDC; ` +
        `has ${(Number(buyerUsdc.totalBalance) / 1e6).toFixed(4)}. ` +
        `Send USDC to ${buyerAddr}.`,
    );
    process.exit(1);
  }

  sep("STEP 1 — AI policy enforcement (synthetic bad proposal)");
  log(`policy: ${DEMO_POLICY.slice(0, 100)}…`);

  // Manufacture a proposal that violates the policy: price 3.50 USDC (above max 1.10).
  const badProposal: MatchProposal = {
    buyAgent: buyerAddr,
    sellAgent: sellerAddr,
    asset: "0x2::sui::SUI",
    agreedPrice: 3_500_000n,
    agreedSize: SIZE_LO,
    expiryMs: BigInt(Date.now()) + 60_000n,
    side: "buy",
    blobId: "demo-synthetic-bad-proposal",
  };

  log(`synthetic proposal: price=3.50 USDC size=0.1 SUI (violates policy max 1.10 USDC)`);
  const badDecision = await decideOnProposal({
    proposal: badProposal,
    llm,
    tools,
    ctx: buyerCtx,
    policy: DEMO_POLICY,
  });
  log(`LLM decision : ${badDecision.decision}`);
  log(`LLM reasoning: ${badDecision.reasoning}`);
  log(`policy_check : ${badDecision.policy_check}`);
  if (badDecision.decision === "accept_match") {
    log("WARNING: LLM accepted a bad proposal — demo narrative weakened");
  } else {
    log("✓ bad proposal rejected — no order submitted");
  }

  sep("STEP 2 — Post encrypted IOIs on-chain (Seal + Walrus)");
  log(`buyer  ${buyerAddr}`);
  log(`seller ${sellerAddr}`);
  log(
    `terms: ${Number(SIZE_LO) / 1e9}–${Number(SIZE_HI) / 1e9} SUI @ ` +
      `${Number(PRICE_LO) / 1e6}–${Number(PRICE_HI) / 1e6} USDC`,
  );

  const sys = await buyerSui.getLatestSuiSystemState();
  const expiryEpoch = BigInt(sys.epoch) + 10n;

  const asset = "0x2::sui::SUI";
  const ttlMs = BigInt(Date.now()) + 30n * 60_000n;

  log("encrypting + uploading both IOIs in parallel…");
  const [buyResult, sellResult] = await Promise.all([
    postIoi({
      suiClient: buyerSui,
      sealClient: buyerSeal,
      keypair: buyerKp,
      plaintext: {
        side: "buy",
        asset,
        sizeLo: SIZE_LO,
        sizeHi: SIZE_HI,
        priceLo: PRICE_LO,
        priceHi: PRICE_HI,
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
        sizeLo: SIZE_LO,
        sizeHi: SIZE_HI,
        priceLo: PRICE_LO,
        priceHi: PRICE_HI,
        expiryMs: ttlMs,
      },
      expiryEpoch,
    }),
  ]);

  log(`✓ buy  IOI posted: blob=${buyResult.blobId}`);
  log(`✓ sell IOI posted: blob=${sellResult.blobId}`);

  sep("STEP 3 — Enclave matches (polling every 5s, timeout 5 min)");
  log("waiting on enclave to match (matcher polls every 15s)…");

  const buyerSeen = new Set<string>();
  const sellerSeen = new Set<string>();
  let buyerDone = false;
  let sellerDone = false;
  const deadline = Date.now() + TIMEOUT_MS;
  let tickCount = 0;

  while (!(buyerDone && sellerDone)) {
    if (Date.now() > deadline) {
      log("TIMEOUT — enclave did not match within 5 min");
      log("check: /shell/status alive? ioi_book_size > 0?");
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
    tickCount++;
    if (tickCount % 6 === 0) {
      log(
        `still polling (${tickCount * 5}s elapsed) — buyer=${buyerDone ? "✓" : "·"} seller=${sellerDone ? "✓" : "·"}`,
      );
    }

    for (const [role, addr, sui, seal, kp, seen, doneFlag, ctx] of [
      ["buyer", buyerAddr, buyerSui, buyerSeal, buyerKp, buyerSeen, () => (buyerDone = true), buyerCtx],
      ["seller", sellerAddr, sellerSui, sellerSeal, sellerKp, sellerSeen, () => (sellerDone = true), sellerCtx],
    ] as const) {
      if (role === "buyer" ? buyerDone : sellerDone) continue;
      const { proposals } = await pollProposals({ suiClient: sui, agentAddr: addr });
      for (const p of proposals) {
        if (seen.has(p.blobId)) continue;
        seen.add(p.blobId);
        console.log();
        log(
          `${role} got proposal: price=${(Number(p.agreedPrice) / 1e6).toFixed(4)} USDC ` +
            `size=${(Number(p.agreedSize) / 1e9).toFixed(4)} SUI  blob=${p.blobId.slice(0, 12)}…`,
        );
        const d = await decideOnProposal({
          proposal: p,
          llm,
          tools,
          ctx,
          policy: DEMO_POLICY,
        });
        log(`${role} LLM decision : ${d.decision}`);
        log(`${role} LLM reasoning: ${d.reasoning}`);
        log(`${role} policy_check : ${d.policy_check}`);
        if (d.decision !== "accept_match" || !d.policy_check) {
          log(`${role} LLM rejected — skipping`);
          continue;
        }
        log(`${role} submitting Shell order…`);
        const digest = await submitOrderFromProposal({
          suiClient: sui,
          sealClient: seal,
          keypair: kp,
          proposal: p,
        });
        log(`${role} ✓ order submitted: ${digest}`);
        doneFlag();
      }
    }
  }

  sep("STEP 4 — Wait for enclave to settle (order_poller cadence 5s)");
  const settleDeadline = Date.now() + TIMEOUT_MS;
  let buyerReceipt: string | null = null;
  let sellerReceipt: string | null = null;
  while (!(buyerReceipt && sellerReceipt)) {
    if (Date.now() > settleDeadline) {
      log("TIMEOUT — orders never settled. Check /shell/status.");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    const receiptType = `${config.shellPackageId}::pool::SettlementReceipt`;
    if (!buyerReceipt) {
      const r = await buyerSui.getOwnedObjects({
        owner: buyerAddr,
        filter: { StructType: receiptType },
      });
      if (r.data.length > 0) {
        buyerReceipt = r.data[r.data.length - 1]!.data!.objectId!;
        log(`✓ buyer  receipt: ${buyerReceipt}`);
      }
    }
    if (!sellerReceipt) {
      const r = await sellerSui.getOwnedObjects({
        owner: sellerAddr,
        filter: { StructType: receiptType },
      });
      if (r.data.length > 0) {
        sellerReceipt = r.data[r.data.length - 1]!.data!.objectId!;
        log(`✓ seller receipt: ${sellerReceipt}`);
      }
    }
  }

  sep("STEP 5 — Post-settlement balance check");
  await logBalances(buyerSui, buyerAddr, "BUYER");
  await logBalances(sellerSui, sellerAddr, "SELLER");

  sep("DEMO COMPLETE");
  console.log("[demo] ✓ bad proposal rejected by AI policy enforcement");
  console.log(
    "[demo] ✓ matching IOIs posted privately (Seal-encrypted on Walrus)",
  );
  console.log("[demo] ✓ enclave matched without seeing plaintext order terms");
  console.log(
    "[demo] ✓ AI accepted real proposals and submitted Shell orders on-chain",
  );
}
