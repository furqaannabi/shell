import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { appendEntry } from "./journal.js";
import { postIoi } from "./ioi.js";
import { makeLlmClient } from "./llm/index.js";
import { decideOnProposal } from "./llm/loop.js";
import { decideIoiTerms } from "./llm/strategy.js";
import { logEvent, logFail, logVerdict, logWarn } from "./log.js";
import { submitOrderFromProposal } from "./orders.js";
import { pollProposals } from "./proposals.js";
import { ToolRegistry, type IoiHistoryEntry } from "./tools/registry.js";
import { builtinTools } from "./tools/builtin.js";
import { loadPlugins } from "./tools/plugins.js";
import { loadMcpTools, closeMcpClients } from "./tools/mcp.js";

const POLL_INTERVAL_MS = (config.pollIntervalSec ?? 15) * 1_000;

/** Seal testnet key server — same one the enclave and web use. */
const SEAL_TESTNET_KEY_SERVER = {
  objectId:
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
  weight: 1,
};

/** Main decision loop: poll MatchProposed → LLM evaluate → submit order. */
export async function runAgent(): Promise<void> {
  if (!config.agentPrivateKey) {
    throw new Error("AGENT_PRIVATE_KEY is required — set it in .env");
  }
  const keypair = Ed25519Keypair.fromSecretKey(config.agentPrivateKey);
  const agentAddr = keypair.toSuiAddress();
  logEvent('INFO', `address ${agentAddr}`);
  logEvent('INFO', `policy: ${config.agentPolicy}`);

  const suiClient = new SuiJsonRpcClient({
    url: config.suiRpcUrl,
    network: "testnet",
  });
  const sealClient = new SealClient({
    suiClient: suiClient as never,
    serverConfigs: [SEAL_TESTNET_KEY_SERVER],
    verifyKeyServers: false,
  });

  const llm = makeLlmClient();
  const tools = new ToolRegistry();
  tools.registerMany(builtinTools);
  await loadPlugins(tools);
  await loadMcpTools(tools);
  // In-process IOI history. Newest first. Capped at 20.
  const ioiHistory: IoiHistoryEntry[] = [];
  const HISTORY_MAX = 20;
  function getIoiHistory(): IoiHistoryEntry[] {
    // Mark expired entries (still pending past their expiry_ms).
    const nowMs = Date.now();
    for (const e of ioiHistory) {
      if (e.status === "pending" && e.expiry_ms < nowMs) e.status = "expired";
    }
    return ioiHistory;
  }

  const toolCtx = { suiClient, sealClient, keypair, address: agentAddr, getIoiHistory };

  const shutdown = () => { void closeMcpClients().finally(() => process.exit(0)); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  logEvent('INFO', `tools: ${tools.list().map((t) => t.name).join(', ')}`);

  // blobId → expiryMs; pruned each tick so memory stays bounded.
  const seenProposals = new Map<string, number>();
  // Blob IDs that returned 404 — expired on Walrus, skip forever.
  const skipBlobIds = new Set<string>();
  // Track when the active IOI expires so we re-post before it lapses.
  let ioiExpiryMs = 0;

  while (true) {
    try {
      // Prune proposals whose on-chain expiry has passed.
      const nowMs = Date.now();
      for (const [id, exp] of seenProposals) {
        if (exp < nowMs) seenProposals.delete(id);
      }

      // Auto-post IOI if none active (or expiring within 60s).
      if (Date.now() >= ioiExpiryMs - 60_000) {
        try {
          // LLM picks IOI terms from live data + policy. Falls back to
          // env defaults on failure / missing fields.
          const strategy = await decideIoiTerms({
            llm,
            tools,
            ctx: toolCtx,
            policy: config.agentPolicy,
            defaults: {
              side: config.ioiSide,
              asset: config.ioiAsset,
              sizeLo: config.ioiSizeLo,
              sizeHi: config.ioiSizeHi,
              priceLo: config.ioiPriceLo,
              priceHi: config.ioiPriceHi,
              ttlMin: config.ioiTtlMin,
            },
          });

          if (strategy.skip) {
            logEvent('IOI', `skipped — ${strategy.reasoning}`);
            // Re-check next tick rather than waiting full TTL.
            ioiExpiryMs = Date.now() + POLL_INTERVAL_MS;
          } else {
            const ttlMin = strategy.ttlMin ?? config.ioiTtlMin;
            const ttlMs = ttlMin * 60_000;
            const sys = await suiClient.getLatestSuiSystemState();
            const expiryEpoch = BigInt(sys.epoch) + 10n;
            const { blobId, digest } = await postIoi({
              suiClient,
              sealClient,
              keypair,
              plaintext: {
                side: strategy.side!,
                asset: strategy.asset!,
                sizeLo: strategy.sizeLo!,
                sizeHi: strategy.sizeHi!,
                priceLo: strategy.priceLo!,
                priceHi: strategy.priceHi!,
                expiryMs: BigInt(Date.now()) + BigInt(ttlMs),
              },
              expiryEpoch,
            });
            ioiExpiryMs = Date.now() + ttlMs;
            // Record in ring buffer so future ticks can read past terms + outcomes.
            ioiHistory.unshift({
              posted_at_ms: Date.now(),
              blob_id: blobId,
              side: strategy.side!,
              asset: strategy.asset!,
              size_lo: strategy.sizeLo!.toString(),
              size_hi: strategy.sizeHi!.toString(),
              price_lo: strategy.priceLo!.toString(),
              price_hi: strategy.priceHi!.toString(),
              ttl_min: ttlMin,
              expiry_ms: ioiExpiryMs,
              status: "pending",
              reasoning: strategy.reasoning,
            });
            if (ioiHistory.length > HISTORY_MAX) ioiHistory.length = HISTORY_MAX;
            logEvent('IOI', `posted  side=${strategy.side}  size=${strategy.sizeLo}-${strategy.sizeHi}  price=${strategy.priceLo}-${strategy.priceHi}  ttl=${ttlMin}min  blob=${blobId}  tx=${digest}`);
            logEvent('IOI', `reason: ${strategy.reasoning}`);
            await appendEntry({
              timestamp_ms: Date.now(),
              agent_id: agentAddr,
              event: "ioi_posted",
              action_digest: digest,
              notes: `blob=${blobId} side=${strategy.side} reasoning=${strategy.reasoning}`,
            });
          }
        } catch (e) {
          logFail(`IOI post failed: ${(e as Error).message}`);
          // Don't retry every tick on failure — back off one poll window.
          ioiExpiryMs = Date.now() + POLL_INTERVAL_MS;
        }
      }

      const { proposals } = await pollProposals({
        suiClient,
        agentAddr,
        skipBlobIds,
      });

      for (const p of proposals) {
        if (seenProposals.has(p.blobId)) continue;
        seenProposals.set(p.blobId, Number(p.expiryMs));

        // Mark matching IOI in history. Enclave guarantees proposal terms
        // fall inside the IOI's declared range — find most recent pending
        // IOI of same side+asset where (price, size) are in range.
        const ioi = ioiHistory.find(
          (e) =>
            e.status === "pending" &&
            e.side === p.side &&
            e.asset === p.asset &&
            p.agreedPrice >= BigInt(e.price_lo) &&
            p.agreedPrice <= BigInt(e.price_hi) &&
            p.agreedSize >= BigInt(e.size_lo) &&
            p.agreedSize <= BigInt(e.size_hi),
        );
        if (ioi) {
          ioi.status = "matched";
          ioi.matched_at_ms = Date.now();
        }

        const priceUsdc = (Number(p.agreedPrice) / 1e6).toFixed(4);
        const sizeSui   = (Number(p.agreedSize)  / 1e9).toFixed(4);
        logEvent('PROPOSAL', `side=${p.side}  price=${priceUsdc} USDC  size=${sizeSui} SUI  blob=${p.blobId.slice(0, 12)}…`);
        await appendEntry({
          timestamp_ms: Date.now(),
          agent_id: agentAddr,
          event: "proposal_received",
          proposal: {
            ...p,
            agreedPrice: p.agreedPrice.toString(),
            agreedSize: p.agreedSize.toString(),
            expiryMs: p.expiryMs.toString(),
          },
        });

        // Per-proposal try/catch: one bad LLM response must not skip the rest.
        try {
          // LLM decision — multi-turn tool-use loop.
          const decision = await decideOnProposal({
            proposal: p,
            llm,
            tools,
            ctx: toolCtx,
            policy: config.agentPolicy,
          });
          logVerdict(decision.decision, decision.reasoning, decision.policy_check);
          await appendEntry({
            timestamp_ms: Date.now(),
            agent_id: agentAddr,
            event: "decision",
            decision,
          });

          if (decision.decision !== "accept_match") continue;
          if (!decision.policy_check) {
            logWarn('policy_check=false → skipping auto-execute');
            continue;
          }

          // Execute: submit Shell sealed order with proposal terms.
          const digest = await submitOrderFromProposal({
            suiClient,
            sealClient,
            keypair,
            proposal: p,
          });
          logEvent('ORDER', `submitted  tx=${digest}`);
          await appendEntry({
            timestamp_ms: Date.now(),
            agent_id: agentAddr,
            event: "order_submitted",
            action_digest: digest,
          });
        } catch (e) {
          logFail(`proposal ${p.blobId.slice(0, 12)} error: ${(e as Error).message}`);
          // Allow retry next tick — remove from seen so a transient failure
          // (e.g. RPC timeout, LLM error) doesn't permanently skip this proposal.
          seenProposals.delete(p.blobId);
        }
      }
    } catch (e) {
      logFail(`tick error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
