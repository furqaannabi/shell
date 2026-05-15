// HTTP-mode spike: submit a crossing pair to testnet, ask the registered
// Nautilus enclave at deployments.enclaveUrl to match + sign.
//
// Plaintexts are still handed to the enclave over a side channel — Seal
// decryption inside Nitro is the next piece. Wire shape of the response
// is the same either way.
//
// Prereqs: `npm run build` (this package). Requires the Nitro enclave
// at deployments.enclaveUrl to be live with the secrets handshake done
// — see docs/aws-deployment.md.
//
//   node scripts/spike-end-to-end.mjs

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

const SEAL_TESTNET_KEY_SERVER =
  "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98";
const SEAL_TESTNET_AGGREGATOR = "https://seal-aggregator-testnet.mystenlabs.com";

function loadActiveKeypair() {
  const path = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const entries = JSON.parse(readFileSync(path, "utf8"));
  const raw = Buffer.from(entries[0], "base64");
  if (raw[0] !== 0x00) throw new Error(`expected ed25519 flag, got 0x${raw[0].toString(16)}`);
  return Ed25519Keypair.fromSecretKey(raw.subarray(1));
}

async function submitOne(sui, seal, kp, order, expiry) {
  const enc = await encryptOrder({
    sealClient: seal,
    shellPackageId: deployments.packageId,
    threshold: 1,
    order,
  });

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
    options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== "success") {
    throw new Error(`submit failed: ${JSON.stringify(res.effects?.status)}`);
  }
  const orderObj = res.objectChanges?.find(
    (c) => c.type === "created" && c.objectType?.includes("OrderCommitment"),
  );
  if (!orderObj) throw new Error("OrderCommitment not found in object changes");
  return { orderId: orderObj.objectId, digest: res.digest };
}

function hexFromBytes(arr) {
  return "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const enclaveUrl = deployments.enclaveUrl;
  if (!enclaveUrl) {
    throw new Error(
      "deployments/testnet.json has no enclaveUrl — register the enclave first per docs/aws-deployment.md",
    );
  }

  const kp = loadActiveKeypair();
  const trader = kp.toSuiAddress();
  console.log("sender:", trader);
  console.log("enclave:", enclaveUrl, "(mode:", deployments.enclaveMode ?? "unknown", ")");

  // Health probe before we burn gas.
  const health = await fetch(`${enclaveUrl}/health_check`).then((r) => r.json());
  console.log("enclave health pk:", health.pk);

  const sui = new SuiJsonRpcClient({ network: "testnet", url: getJsonRpcFullnodeUrl("testnet") });
  const seal = new SealClient({
    suiClient: sui,
    serverConfigs: [
      { objectId: SEAL_TESTNET_KEY_SERVER, aggregatorUrl: SEAL_TESTNET_AGGREGATOR, weight: 1 },
    ],
    verifyKeyServers: false,
  });

  const sys = await sui.getLatestSuiSystemState();
  const expiry = BigInt(sys.epoch) + 5n;
  console.log("current epoch:", sys.epoch, "→ expiry:", expiry.toString());

  const buy = {
    side: "buy",
    size: 100n,
    limitPrice: 12_500n,
    expiryEpoch: expiry,
    maxSlippageBps: 50,
  };
  const sell = {
    side: "sell",
    size: 100n,
    limitPrice: 12_400n,
    expiryEpoch: expiry,
    maxSlippageBps: 50,
  };

  console.log("\nsubmitting buy...");
  const buyRes = await submitOne(sui, seal, kp, buy, expiry);
  console.log("  order_id:", buyRes.orderId);
  await sui.waitForTransaction({ digest: buyRes.digest });

  console.log("submitting sell...");
  const sellRes = await submitOne(sui, seal, kp, sell, expiry);
  console.log("  order_id:", sellRes.orderId);
  await sui.waitForTransaction({ digest: sellRes.digest });

  const enclaveRequest = {
    payload: {
      orders: [
        {
          order_id: buyRes.orderId,
          trader,
          plaintext: {
            side: buy.side,
            size: Number(buy.size),
            limit_price: Number(buy.limitPrice),
            expiry_epoch: Number(buy.expiryEpoch),
            max_slippage_bps: buy.maxSlippageBps,
          },
        },
        {
          order_id: sellRes.orderId,
          trader,
          plaintext: {
            side: sell.side,
            size: Number(sell.size),
            limit_price: Number(sell.limitPrice),
            expiry_epoch: Number(sell.expiryEpoch),
            max_slippage_bps: sell.maxSlippageBps,
          },
        },
      ],
    },
  };

  console.log("\nposting /process_data...");
  const res = await fetch(`${enclaveUrl}/process_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enclaveRequest),
  });
  if (!res.ok) {
    throw new Error(`enclave HTTP ${res.status}: ${await res.text()}`);
  }
  const signed = await res.json();

  console.log("enclave pubkey:", signed.enclave_pubkey);
  console.log("timestamp_ms :", signed.timestamp_ms);
  console.log("signed matches:", signed.matches.length);

  for (const m of signed.matches) {
    const p = m.envelope.data;
    console.log("\n--- match ---");
    console.log("  maker_order:", hexFromBytes(p.maker_order));
    console.log("  taker_order:", hexFromBytes(p.taker_order));
    console.log("  maker      :", hexFromBytes(p.maker));
    console.log("  taker      :", hexFromBytes(p.taker));
    console.log("  filled_size :", p.filled_size);
    console.log("  filled_price:", p.filled_price);
    console.log("  signature   :", m.signature.slice(0, 32) + "...");
  }

  console.log("\nNEXT:");
  console.log("  - Build settlement PTB: shell::attestation::verify(...) -> shell::settlement::settle<TMaker,TTaker>(...)");
  console.log("  - Sign and submit to testnet to mint SettlementReceipt for each side.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
