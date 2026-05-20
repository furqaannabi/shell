#!/usr/bin/env node
import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { runAgent } from "./agent.js";
import { config } from "./config.js";
import { appendEntry } from "./journal.js";
import { postIoi } from "./ioi.js";

const SEAL_TESTNET_KEY_SERVER = {
  objectId:
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  weight: 1,
};

/**
 * CLI:
 *   shell-agent run                    # main decision loop
 *   shell-agent post-ioi <args>        # one-shot: post an IOI
 */
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case undefined:
    case "run":
      await runAgent();
      break;

    case "post-ioi": {
      const args = parseFlags(rest);
      const side = args.side as "buy" | "sell";
      if (side !== "buy" && side !== "sell") {
        throw new Error("--side=buy|sell required");
      }
      const asset = args.asset ?? "0x2::sui::SUI";
      const sizeLo = BigInt(args["size-lo"] ?? "1000000000"); // 1 SUI
      const sizeHi = BigInt(args["size-hi"] ?? "10000000000"); // 10 SUI
      const priceLo = BigInt(args["price-lo"] ?? "1000000000");
      const priceHi = BigInt(args["price-hi"] ?? "2000000000");
      const ttlMs = BigInt(args["ttl-ms"] ?? "1800000"); // 30 min
      const expiryMs = BigInt(Date.now()) + ttlMs;

      const keypair = Ed25519Keypair.fromSecretKey(config.agentPrivateKey);
      const suiClient = new SuiJsonRpcClient({
        url: config.suiRpcUrl,
        network: "testnet",
      });
      const sealClient = new SealClient({
        suiClient: suiClient as never,
        serverConfigs: [SEAL_TESTNET_KEY_SERVER],
        verifyKeyServers: false,
      });

      const sys = await suiClient.getLatestSuiSystemState();
      const expiryEpoch = BigInt(sys.epoch) + 7n; // ~7 days

      const { blobId, digest } = await postIoi({
        suiClient,
        sealClient,
        keypair,
        plaintext: {
          side,
          asset,
          sizeLo,
          sizeHi,
          priceLo,
          priceHi,
          expiryMs,
        },
        expiryEpoch,
      });

      console.log(`IOI posted: blob=${blobId} tx=${digest}`);
      await appendEntry({
        timestamp_ms: Date.now(),
        agent_id: keypair.toSuiAddress(),
        event: "ioi_posted",
        action_digest: digest,
        notes: `blob=${blobId} side=${side} asset=${asset}`,
      });
      break;
    }

    default:
      console.error(`unknown command: ${cmd}`);
      process.exit(1);
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq >= 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      out[a.slice(2)] = args[i + 1] ?? "";
      i++;
    }
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
