// One-shot integration test: encrypt a sample order, submit OrderCommitment to testnet.
//
// Run after `npm run build`:
//   node scripts/submit-test-order.mjs
//
// Reads the active keypair from ~/.sui/sui_config/sui.keystore.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";

import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { encryptOrder, submitOrderTx } from "../dist/index.js";
import deployments from "../deployments/testnet.json" with { type: "json" };

// Testnet Seal key server, decentralized config.
const SEAL_TESTNET_KEY_SERVER =
  "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98";
const SEAL_TESTNET_AGGREGATOR = "https://seal-aggregator-testnet.mystenlabs.com";

function loadActiveKeypair() {
  const path = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const entries = JSON.parse(readFileSync(path, "utf8"));
  // base64-encoded: [flag (1 byte) || secret (32 bytes)] for ed25519.
  const raw = Buffer.from(entries[0], "base64");
  if (raw[0] !== 0x00) throw new Error(`expected ed25519 flag, got 0x${raw[0].toString(16)}`);
  return Ed25519Keypair.fromSecretKey(raw.subarray(1));
}

async function main() {
  const kp = loadActiveKeypair();
  const sender = kp.toSuiAddress();
  console.log("sender:", sender);

  const sui = new SuiJsonRpcClient({ network: "testnet", url: getJsonRpcFullnodeUrl("testnet") });
  const seal = new SealClient({
    suiClient: sui,
    serverConfigs: [
      {
        objectId: SEAL_TESTNET_KEY_SERVER,
        aggregatorUrl: SEAL_TESTNET_AGGREGATOR,
        weight: 1,
      },
    ],
    verifyKeyServers: false,
  });

  const sys = await sui.getLatestSuiSystemState();
  const currentEpoch = BigInt(sys.epoch);
  const expiry = currentEpoch + 5n;
  console.log("current epoch:", currentEpoch, "→ expiry:", expiry);

  const enc = await encryptOrder({
    sealClient: seal,
    shellPackageId: deployments.packageId,
    threshold: 1,
    order: {
      side: "buy",
      size: 1_000n,
      limitPrice: 12_500n,
      expiryEpoch: expiry,
      maxSlippageBps: 50,
    },
  });
  console.log("sealed envelope:", enc.sealedEnvelope.length, "bytes");
  console.log("commit hash:", Buffer.from(enc.commitHash).toString("hex"));

  const tx = new Transaction();
  const [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(10_000_000n)]); // 0.01 SUI
  submitOrderTx({
    shellPackageId: deployments.packageId,
    collateralType: "0x2::sui::SUI",
    collateral,
    sealedEnvelope: enc.sealedEnvelope,
    commitHash: enc.commitHash,
    expiryEpoch: expiry,
    tx,
  });

  const res = await sui.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });

  console.log("digest:", res.digest);
  console.log("status:", res.effects?.status);

  const order = res.objectChanges?.find(
    (c) => c.type === "created" && c.objectType?.includes("OrderCommitment"),
  );
  console.log("OrderCommitment:", order?.objectId);

  const submitted = res.events?.find((e) => e.type.endsWith("::OrderSubmitted"));
  console.log("OrderSubmitted event:", submitted?.parsedJson);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
