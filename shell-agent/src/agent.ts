import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { appendEntry } from "./journal.js";
import { evaluateProposal } from "./llm.js";
import { submitOrderFromProposal } from "./orders.js";
import { pollProposals } from "./proposals.js";

const POLL_INTERVAL_MS = 15_000;

/** Seal testnet key server — same one the enclave and web use. */
const SEAL_TESTNET_KEY_SERVER = {
  objectId:
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
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

  let cursor: { txDigest: string; eventSeq: string } | undefined;
  const seenProposals = new Set<string>();

  while (true) {
    try {
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

        // LLM decision.
        const decision = await evaluateProposal(p);
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
