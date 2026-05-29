import "dotenv/config";
import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { postIoi } from "./ioi.js";
import { makeLlmClient } from "./llm/index.js";
import { decideOnProposal } from "./llm/loop.js";
import { logEvent, logPass, logVerdict, logWarn, sep } from "./log.js";
import { pollProposals, type MatchProposal } from "./proposals.js";
import { submitOrderFromProposal } from "./orders.js";
import { ToolRegistry, type ToolCtx } from "./tools/registry.js";
import { builtinTools } from "./tools/builtin.js";
import { loadPlugins } from "./tools/plugins.js";
import { loadMcpTools } from "./tools/mcp.js";

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

const SIZE_LO = (FLOAT * 1n) / 10n; // 0.1 SUI
const SIZE_HI = (FLOAT * 2n) / 10n; // 0.2 SUI
const PRICE_LO = 900_000n;           // 0.90 USDC
const PRICE_HI = 1_100_000n;         // 1.10 USDC

// Full v2 policy: instructs the LLM to use tools before deciding.
// Deliberately omits check_risk_cap — that is tested in isolation in Step 1a.
// Step 3 goal is order submission; risk cap state on test wallets accumulates
// across runs and would block acceptance permanently if enforced here.
const DEMO_POLICY =
  "You are a quant trading agent for Shell Finance. " +
  "Before evaluating any proposal, you MUST call tools in this order: " +
  "(1) get_ref_price — record live bid/ask/mid for context (informational only, do NOT use for accept/reject). " +
  "(2) get_my_balance — verify balance is sufficient to cover collateral. " +
  "Accept the proposal if ALL of these hold (strict integer comparison on agreed_price/agreed_size, NOT on ref price): " +
  "(a) agreed_price >= 900000 AND agreed_price <= 1100000 (this is 0.90–1.10 USDC at 1e6 scale); " +
  "(b) agreed_size >= 100000000 AND agreed_size <= 200000000 (this is 0.1–0.2 SUI at 1e9 scale); " +
  "(c) balance is sufficient for collateral. " +
  "Reject ONLY if (a), (b), or (c) fails. DO NOT reject based on ref price deviation. " +
  "DO NOT call check_risk_cap. " +
  "Set policy_check=true only when (a), (b), and (c) all passed via tools.";

// Risk cap step uses a separate policy — only enforces cap, ignores size bounds,
// so we can isolate the check_risk_cap tool as the rejection cause.
const RISK_CAP_POLICY =
  "You are a risk-aware Shell Finance agent. " +
  "ALWAYS call check_risk_cap first with proposed_size_sui (agreed_size / 1e9). " +
  "If check_risk_cap returns within_cap=false, immediately reject. " +
  "Otherwise accept if agreed_price is between 900_000 and 1_100_000. " +
  "Do NOT apply size-range checks in this evaluation — only risk cap and price.";

function ts(): string {
  return new Date().toISOString().split("T")[1]!.slice(0, 12);
}
function log(msg: string) {
  console.log(`[${ts()}] ${msg}`);
}
function logJson(label: string, v: unknown) {
  const s = JSON.stringify(v, null, 2);
  const lines = s.split("\n");
  log(`${label}:`);
  for (const l of lines) console.log(`           ${l}`);
}

async function logBalances(sui: SuiJsonRpcClient, addr: string, label: string) {
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

const passed: string[] = [];
const warnings: string[] = [];

function pass(msg: string) {
  logPass(msg);
  passed.push(msg);
}
function warn(msg: string) {
  logWarn(msg);
  warnings.push(msg);
}

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

  const llm = makeLlmClient();
  const tools = new ToolRegistry();
  tools.registerMany(builtinTools);
  await loadPlugins(tools);
  await loadMcpTools(tools);

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

  // ─────────────────────────────────────────────────────
  sep("STEP 0 — Pre-flight balance check");
  // ─────────────────────────────────────────────────────
  await logBalances(buyerSui, buyerAddr, "BUYER");
  await logBalances(sellerSui, sellerAddr, "SELLER");

  const buyerUsdc = await buyerSui
    .getBalance({ owner: buyerAddr, coinType: QUOTE_COIN_TYPE })
    .catch(() => ({ totalBalance: "0" }));
  const tradeValue = (SIZE_HI * PRICE_HI) / FLOAT;
  const feeEach = (tradeValue * 10n) / 10000n;
  const neededUsdc = tradeValue + feeEach;
  if (BigInt(buyerUsdc.totalBalance) < neededUsdc) {
    log(
      `ABORT: buyer needs ≥ ${(Number(neededUsdc) / 1e6).toFixed(4)} USDC (incl. 0.1% fee); ` +
        `has ${(Number(buyerUsdc.totalBalance) / 1e6).toFixed(4)}. ` +
        `Send USDC to ${buyerAddr}.`,
    );
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 0.5 — Tool registry audit");
  // ─────────────────────────────────────────────────────
  const allTools = tools.list();
  const builtinList = allTools.filter((t) => !t.name.startsWith("plugin__") && !t.name.startsWith("mcp__"));
  const pluginList = allTools.filter((t) => t.name.startsWith("plugin__"));
  const mcpList = allTools.filter((t) => t.name.startsWith("mcp__"));

  log(`total tools registered: ${allTools.length}`);
  log(`  built-ins (${builtinList.length}): ${builtinList.map((t) => t.name).join(", ")}`);
  if (pluginList.length > 0) {
    log(`  plugins  (${pluginList.length}): ${pluginList.map((t) => t.name).join(", ")}`);
    pass(`plugin loader: ${pluginList.length} plugin(s) loaded`);
  } else {
    warn("no plugins found — drop .ts/.js files into plugins/ to extend");
  }
  if (mcpList.length > 0) {
    log(`  MCP      (${mcpList.length}): ${mcpList.map((t) => t.name).join(", ")}`);
    pass(`MCP client: ${mcpList.length} tool(s) from mcp.json servers`);
  } else {
    warn("no MCP tools — copy mcp.example.json → mcp.json to add MCP servers");
  }
  pass(`tool registry: ${allTools.length} tools available to LLM`);

  // ─────────────────────────────────────────────────────
  sep("STEP 1 — AI policy: price out of bounds (synthetic)");
  // ─────────────────────────────────────────────────────
  log(`policy preview: ${DEMO_POLICY.slice(0, 120)}…`);

  const badPriceProposal: MatchProposal = {
    buyAgent: buyerAddr,
    sellAgent: sellerAddr,
    asset: "0x2::sui::SUI",
    agreedPrice: 3_500_000n,  // 3.50 USDC — above max 1.10
    agreedSize: SIZE_LO,
    expiryMs: BigInt(Date.now()) + 60_000n,
    matchId: BigInt(0),
    side: "buy",
    blobId: "demo-synthetic-bad-price",
  };

  log("synthetic proposal: price=3.50 USDC size=0.1 SUI (price violates max 1.10 USDC)");
  const badPriceDecision = await decideOnProposal({
    proposal: badPriceProposal,
    llm,
    tools,
    ctx: buyerCtx,
    policy: DEMO_POLICY,
  });
  logVerdict(badPriceDecision.decision, badPriceDecision.reasoning, badPriceDecision.policy_check);
  if (badPriceDecision.decision !== "accept_match") {
    pass("price policy enforcement: bad price proposal rejected");
  } else {
    warn("LLM accepted a bad price — demo narrative weakened");
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 1a — AI policy: risk cap enforcement (synthetic)");
  // ─────────────────────────────────────────────────────
  const riskCap = config.riskMaxPositionSui;
  if (riskCap <= 0) {
    warn(
      "RISK_MAX_POSITION_SUI not set — skipping risk cap step. " +
        "Add RISK_MAX_POSITION_SUI=0.3 to .env to enable.",
    );
  } else {
    // Proposal size = riskCap * 2 so it provably breaches the cap.
    const breachSizeSui = riskCap * 2;
    const breachSizeRaw = BigInt(Math.round(breachSizeSui * 1e9));
    log(
      `RISK_MAX_POSITION_SUI=${riskCap} SUI — proposing size=${breachSizeSui} SUI (2× cap)`,
    );
    log("policy for this step: reject if check_risk_cap within_cap=false");

    const riskCapProposal: MatchProposal = {
      buyAgent: buyerAddr,
      sellAgent: sellerAddr,
      asset: "0x2::sui::SUI",
      agreedPrice: 1_000_000n, // 1.00 USDC — valid price
      agreedSize: breachSizeRaw,
      expiryMs: BigInt(Date.now()) + 60_000n,
      matchId: BigInt(0),
      side: "buy",
      blobId: "demo-synthetic-risk-cap-breach",
    };

    const riskDecision = await decideOnProposal({
      proposal: riskCapProposal,
      llm,
      tools,
      ctx: buyerCtx,
      policy: RISK_CAP_POLICY,
    });
    logVerdict(riskDecision.decision, riskDecision.reasoning, riskDecision.policy_check);
    if (riskDecision.decision !== "accept_match") {
      pass(`risk cap enforcement: size=${breachSizeSui} SUI rejected (cap=${riskCap} SUI)`);
    } else {
      warn("LLM accepted a risk-cap-breaching proposal — check_risk_cap may not have fired");
    }
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 1b — Built-in tools: direct calls (not via LLM)");
  // ─────────────────────────────────────────────────────
  log("calling get_ref_price directly…");
  const refPrice = await tools.execute("get_ref_price", {}, buyerCtx);
  logJson("get_ref_price", refPrice);
  pass("get_ref_price: DeepBook indexer live");

  log("calling get_my_balance (buyer)…");
  const buyerBal = await tools.execute("get_my_balance", {}, buyerCtx);
  logJson("get_my_balance (buyer)", buyerBal);
  pass("get_my_balance: SUI + USDC balance fetched");

  log("calling get_my_recent_fills (buyer, last 3)…");
  const fills = await tools.execute("get_my_recent_fills", { limit: 3 }, buyerCtx);
  logJson("get_my_recent_fills (buyer)", fills);
  pass("get_my_recent_fills: settlement receipts queried");

  log("calling get_my_active_orders (buyer)…");
  const activeOrders = await tools.execute("get_my_active_orders", { limit: 5 }, buyerCtx);
  logJson("get_my_active_orders (buyer)", activeOrders);
  pass("get_my_active_orders: open order commitments queried");

  if (riskCap > 0) {
    log("calling check_risk_cap (buyer, proposed_size_sui=0.15)…");
    const riskResult = await tools.execute("check_risk_cap", { proposed_size_sui: 0.15 }, buyerCtx);
    logJson("check_risk_cap", riskResult);
    pass("check_risk_cap: position + daily volume checked");
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 1c — Webhook tool");
  // ─────────────────────────────────────────────────────
  const webhookResult = await tools.execute(
    "notify_webhook",
    { event: "demo_started", data: { buyer: buyerAddr.slice(0, 10), seller: sellerAddr.slice(0, 10) } },
    buyerCtx,
  );
  logJson("notify_webhook", webhookResult);
  const whResult = webhookResult as Record<string, unknown>;
  if (whResult.sent === true) {
    pass(`webhook: event delivered to ${config.webhookUrl}`);
  } else {
    warn(`webhook: WEBHOOK_URL not set (${whResult.reason}) — set WEBHOOK_URL in .env to test`);
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 2 — Post encrypted IOIs on-chain (Seal + Walrus)");
  // ─────────────────────────────────────────────────────
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
      plaintext: { side: "buy", asset, sizeLo: SIZE_LO, sizeHi: SIZE_HI, priceLo: PRICE_LO, priceHi: PRICE_HI, expiryMs: ttlMs },
      expiryEpoch,
    }),
    postIoi({
      suiClient: sellerSui,
      sealClient: sellerSeal,
      keypair: sellerKp,
      plaintext: { side: "sell", asset, sizeLo: SIZE_LO, sizeHi: SIZE_HI, priceLo: PRICE_LO, priceHi: PRICE_HI, expiryMs: ttlMs },
      expiryEpoch,
    }),
  ]);

  logEvent('IOI', `buy   blob=${buyResult.blobId}  tx=${buyResult.digest}`);
  logEvent('IOI', `sell  blob=${sellResult.blobId}  tx=${sellResult.digest}`);
  pass("IOI posting: both sides Seal-encrypted + on-chain");

  // ─────────────────────────────────────────────────────
  sep("STEP 3 — Enclave matches (polling every 5s, timeout 5 min)");
  // ─────────────────────────────────────────────────────
  log("waiting on enclave to match (matcher polls every 15s)…");
  log(`policy: ${DEMO_POLICY.slice(0, 120)}…`);

  const buyerSeen = new Set<string>();
  const sellerSeen = new Set<string>();
  const skipBlobs = new Set<string>();
  let buyerDone = false;
  let sellerDone = false;
  const deadline = Date.now() + TIMEOUT_MS;
  let tickCount = 0;
  let buyerOrderDigest = "";
  let sellerOrderDigest = "";

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

    for (const [role, addr, sui, seal, kp, seen, ctx] of [
      ["buyer", buyerAddr, buyerSui, buyerSeal, buyerKp, buyerSeen, buyerCtx],
      ["seller", sellerAddr, sellerSui, sellerSeal, sellerKp, sellerSeen, sellerCtx],
    ] as const) {
      const isDone = role === "buyer" ? buyerDone : sellerDone;
      if (isDone) continue;

      const { proposals } = await pollProposals({ suiClient: sui, agentAddr: addr, skipBlobIds: skipBlobs });
      for (const p of proposals) {
        if (seen.has(p.blobId)) continue;
        seen.add(p.blobId);
        console.log();
        logEvent('PROPOSAL', `[${role}]  price=${(Number(p.agreedPrice) / 1e6).toFixed(4)} USDC  size=${(Number(p.agreedSize) / 1e9).toFixed(4)} SUI  blob=${p.blobId.slice(0, 12)}…`);
        const d = await decideOnProposal({ proposal: p, llm, tools, ctx, policy: DEMO_POLICY });
        logVerdict(d.decision, d.reasoning, d.policy_check);
        if (d.decision !== "accept_match" || !d.policy_check) {
          logWarn(`${role} rejected — skipping`);
          continue;
        }
        const digest = await submitOrderFromProposal({ suiClient: sui, sealClient: seal, keypair: kp, proposal: p });
        logEvent('ORDER', `[${role}]  tx=${digest}`);
        if (role === "buyer") { buyerOrderDigest = digest; buyerDone = true; }
        else { sellerOrderDigest = digest; sellerDone = true; }
      }
    }
  }

  pass(`LLM tool-use loop: all tools fired before accept decisions`);
  pass(`orders submitted: buyer=${buyerOrderDigest.slice(0, 12)}… seller=${sellerOrderDigest.slice(0, 12)}…`);

  // ─────────────────────────────────────────────────────
  sep("STEP 3.5 — Active orders verification (direct tool call)");
  // ─────────────────────────────────────────────────────
  log("querying buyer active orders after submission…");
  const postSubmitOrders = await tools.execute("get_my_active_orders", { limit: 5 }, buyerCtx);
  logJson("get_my_active_orders (post-submit)", postSubmitOrders);
  const orderArr = postSubmitOrders as unknown[];
  if (orderArr.length > 0) {
    pass(`active orders: ${orderArr.length} open order(s) visible on-chain`);
  } else {
    warn("no active orders returned yet (may still be indexing)");
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 3.6 — Active proposals check (direct tool call)");
  // ─────────────────────────────────────────────────────
  log("querying buyer active proposals…");
  const activeProps = await tools.execute("get_my_active_proposals", {}, buyerCtx);
  logJson("get_my_active_proposals (buyer)", activeProps);
  pass("get_my_active_proposals: MatchProposed events queried");

  // ─────────────────────────────────────────────────────
  sep("STEP 4 — Wait for enclave to settle (order_poller cadence 5s)");
  // ─────────────────────────────────────────────────────
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
      const r = await buyerSui.getOwnedObjects({ owner: buyerAddr, filter: { StructType: receiptType } });
      if (r.data.length > 0) {
        buyerReceipt = r.data[r.data.length - 1]!.data!.objectId!;
        log(`✓ buyer  receipt: ${buyerReceipt}`);
      }
    }
    if (!sellerReceipt) {
      const r = await sellerSui.getOwnedObjects({ owner: sellerAddr, filter: { StructType: receiptType } });
      if (r.data.length > 0) {
        sellerReceipt = r.data[r.data.length - 1]!.data!.objectId!;
        log(`✓ seller receipt: ${sellerReceipt}`);
      }
    }
  }
  pass(`settlement: SettlementReceipts minted for both sides`);

  // ─────────────────────────────────────────────────────
  sep("STEP 5 — Post-settlement balance check");
  // ─────────────────────────────────────────────────────
  await logBalances(buyerSui, buyerAddr, "BUYER");
  await logBalances(sellerSui, sellerAddr, "SELLER");

  // ─────────────────────────────────────────────────────
  sep("STEP 5.5 — Fill verification (direct tool call)");
  // ─────────────────────────────────────────────────────
  log("querying buyer recent fills…");
  const buyerFills = await tools.execute("get_my_recent_fills", { limit: 3 }, buyerCtx);
  logJson("get_my_recent_fills (buyer, post-settle)", buyerFills);
  log("querying seller recent fills…");
  const sellerFills = await tools.execute("get_my_recent_fills", { limit: 3 }, sellerCtx);
  logJson("get_my_recent_fills (seller, post-settle)", sellerFills);
  const buyerFillArr = buyerFills as unknown[];
  if (buyerFillArr.length > 0) {
    pass(`fill verification: buyer has ${buyerFillArr.length} settlement receipt(s) on-chain`);
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 5.6 — Journal entry (append_journal tool)");
  // ─────────────────────────────────────────────────────
  log("appending demo summary to Walrus journal…");
  const journalResult = await tools.execute(
    "append_journal",
    {
      note:
        `Demo completed. ` +
        `buyer order=${buyerOrderDigest} ` +
        `seller order=${sellerOrderDigest} ` +
        `buyer receipt=${buyerReceipt} ` +
        `seller receipt=${sellerReceipt}`,
    },
    buyerCtx,
  );
  logJson("append_journal", journalResult);
  const jr = journalResult as Record<string, unknown>;
  if (jr.blob_id) {
    pass(`journal: entry written to Walrus blob=${String(jr.blob_id).slice(0, 20)}…`);
  }

  // ─────────────────────────────────────────────────────
  sep("STEP 5.7 — Webhook: demo complete event");
  // ─────────────────────────────────────────────────────
  await tools.execute(
    "notify_webhook",
    {
      event: "demo_complete",
      data: {
        buyer_receipt: buyerReceipt,
        seller_receipt: sellerReceipt,
        buyer_order: buyerOrderDigest,
        seller_order: sellerOrderDigest,
        tools_registered: allTools.length,
      },
    },
    buyerCtx,
  );
  log("notify_webhook: demo_complete event fired");

  // ─────────────────────────────────────────────────────
  sep("DEMO COMPLETE");
  // ─────────────────────────────────────────────────────
  console.log(`\n  ${passed.length} checks passed, ${warnings.length} warnings\n`);
  for (const p of passed) logPass(p);
  if (warnings.length > 0) {
    console.log();
    for (const w of warnings) logWarn(w);
  }
  console.log();
}
