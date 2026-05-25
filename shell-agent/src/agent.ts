import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { appendEntry } from "./journal.js";
import { postIoi } from "./ioi.js";
import { makeLlmClient } from "./llm/index.js";
import { decideOnProposal } from "./llm/loop.js";
import { submitOrderFromProposal } from "./orders.js";
import { pollProposals } from "./proposals.js";
import { ToolRegistry } from "./tools/registry.js";
import { builtinTools } from "./tools/builtin.js";
import { loadPlugins } from "./tools/plugins.js";

const POLL_INTERVAL_MS = 15_000;

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
  console.log(`[agent] address ${agentAddr}`);
  console.log(`[agent] policy: ${config.agentPolicy}`);

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
  const toolCtx = { suiClient, sealClient, keypair, address: agentAddr };
  console.log(
    `[agent] tools registered: ${tools.list().map((t) => t.name).join(", ")}`,
  );

  let cursor: { txDigest: string; eventSeq: string } | undefined;
  const seenProposals = new Set<string>();
  // Track when the active IOI expires so we re-post before it lapses.
  let ioiExpiryMs = 0;

  while (true) {
    try {
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
          console.log(`[agent] IOI posted: blob=${blobId} tx=${digest} ttl=${config.ioiTtlMin}min`);
          await appendEntry({
            timestamp_ms: Date.now(),
            agent_id: agentAddr,
            event: "ioi_posted",
            action_digest: digest,
            notes: `blob=${blobId} side=${config.ioiSide}`,
          });
        } catch (e) {
          console.error(`[agent] IOI post failed: ${(e as Error).message}`);
        }
      }

      const { proposals, nextCursor } = await pollProposals({
        suiClient,
        agentAddr,
        cursor,
      });
      if (nextCursor) cursor = nextCursor;

      for (const p of proposals) {
        if (seenProposals.has(p.blobId)) continue;
        seenProposals.add(p.blobId);

        console.log(
          `[agent] new proposal: side=${p.side} price=${p.agreedPrice} size=${p.agreedSize}`,
        );
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

        // LLM decision — multi-turn tool-use loop.
        const decision = await decideOnProposal({
          proposal: p,
          llm,
          tools,
          ctx: toolCtx,
          policy: config.agentPolicy,
        });
        console.log(
          `[agent] decision: ${decision.decision} (policy_ok=${decision.policy_check}) — ${decision.reasoning}`,
        );
        await appendEntry({
          timestamp_ms: Date.now(),
          agent_id: agentAddr,
          event: "decision",
          decision,
        });

        if (decision.decision !== "accept_match") continue;
        if (!decision.policy_check) {
          console.log("[agent] policy_check=false → skipping auto-execute");
          continue;
        }

        // Execute: submit Shell sealed order with proposal terms.
        try {
          const digest = await submitOrderFromProposal({
            suiClient,
            sealClient,
            keypair,
            proposal: p,
          });
          console.log(`[agent] order submitted: ${digest}`);
          await appendEntry({
            timestamp_ms: Date.now(),
            agent_id: agentAddr,
            event: "order_submitted",
            action_digest: digest,
          });
        } catch (e) {
          console.error(`[agent] submit order failed: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      console.error(`[agent] tick error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
