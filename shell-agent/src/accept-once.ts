// One-shot test driver: fetch the latest MatchProposed event where the
// current AGENT_PRIVATE_KEY is buy_agent or sell_agent, accept it by
// calling submit_order with the appropriate collateral.
//
// Usage:
//   AGENT_PRIVATE_KEY=$KEY node ./dist/accept-once.js

import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { config } from "./config.js";
import { submitOrderFromProposal } from "./orders.js";
import { pollProposals } from "./proposals.js";
import { sealKeyServer } from "./seal.js";

async function main() {
  const keypair = Ed25519Keypair.fromSecretKey(config.agentPrivateKey);
  const agentAddr = keypair.toSuiAddress();
  console.log(`[accept-once] agent ${agentAddr}`);

  const suiClient = new SuiJsonRpcClient({
    url: config.suiRpcUrl,
    network: config.network,
  });
  const sealClient = new SealClient({
    suiClient: suiClient as never,
    serverConfigs: [sealKeyServer()],
    verifyKeyServers: false,
  });

  const { proposals } = await pollProposals({
    suiClient,
    agentAddr,
  });
  console.log(`[accept-once] ${proposals.length} proposals for this agent`);
  if (proposals.length === 0) {
    console.log("[accept-once] nothing to accept; exiting");
    return;
  }

  // pollProposals returns descending — proposals[0] is the most recent.
  const proposal = proposals[0];
  console.log(
    `[accept-once] accepting ${proposal.side} ${proposal.agreedSize} @ ${proposal.agreedPrice} (blob ${proposal.blobId})`,
  );

  const digest = await submitOrderFromProposal({
    suiClient,
    sealClient,
    keypair,
    proposal,
  });
  console.log(`[accept-once] submit_order tx: ${digest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
