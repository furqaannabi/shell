import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { appendEntry } from "./journal.js";
import { postIoi } from "./ioi.js";
import { makeLlmClient } from "./llm/index.js";
import { decideOnProposal } from "./llm/loop.js";
import { logEvent, logFail, logVerdict, logWarn } from "./log.js";
import { submitOrderFromProposal } from "./orders.js";
import { pollProposals } from "./proposals.js";
import { ToolRegistry } from "./tools/registry.js";
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
  const toolCtx = { suiClient, sealClient, keypair, address: agentAddr };

  process.once("SIGTERM", () => void closeMcpClients());
  process.once("SIGINT", () => void closeMcpClients());
  logEvent('INFO', `tools: ${tools.list().map((t) => t.name).join(', ')}`);

  let cursor: { txDigest: string; eventSeq: string } | undefined;
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
        const ttlMs = config.ioiTtlMin * 60_000;
        const sys = await suiClient.getLatestSuiSystemState();
        const expiryEpoch = BigInt(sys.epoch) + 10n;
        try {
          const { blobId, digest } = await postIoi({
            suiClient,
            sealClient,
            keypair,
            plaintext: {
              side: config.ioiSide,
              asset: config.ioiAsset,
              sizeLo: config.ioiSizeLo,
              sizeHi: config.ioiSizeHi,
              priceLo: config.ioiPriceLo,
              priceHi: config.ioiPriceHi,
              expiryMs: BigInt(Date.now()) + BigInt(ttlMs),
            },
            expiryEpoch,
          });
          ioiExpiryMs = Date.now() + ttlMs;
          logEvent('IOI', `posted  blob=${blobId}  tx=${digest}  ttl=${config.ioiTtlMin}min`);
          await appendEntry({
            timestamp_ms: Date.now(),
            agent_id: agentAddr,
            event: "ioi_posted",
            action_digest: digest,
            notes: `blob=${blobId} side=${config.ioiSide}`,
          });
        } catch (e) {
          logFail(`IOI post failed: ${(e as Error).message}`);
        }
      }

      const { proposals, nextCursor } = await pollProposals({
        suiClient,
        agentAddr,
        cursor,
        skipBlobIds,
      });
      if (nextCursor) cursor = nextCursor;

      for (const p of proposals) {
        if (seenProposals.has(p.blobId)) continue;
        seenProposals.set(p.blobId, Number(p.expiryMs));

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
        }
      }
    } catch (e) {
      logFail(`tick error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
