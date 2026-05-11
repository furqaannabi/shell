// Offline-mode spike: submit a crossing pair to testnet, then exercise the
// enclave matcher locally. The Seal decryption step is skipped — the
// trader's SDK hands the plaintexts over a side channel.
//
// Prereqs: `npm run build` (this package) and
//   `cargo build --release --bin match-and-sign` (../enclave).
//
//   node scripts/spike-end-to-end.mjs

import { spawnSync } from "node:child_process";
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

const ENCLAVE_BIN = join(
  import.meta.dirname,
  "..",
  "..",
  "enclave",
  "target",
  "release",
  process.platform === "win32" ? "match-and-sign.exe" : "match-and-sign",
);

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

async function main() {
  const kp = loadActiveKeypair();
  const trader = kp.toSuiAddress();
  console.log("sender:", trader);

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

  // Crossing pair: buyer @ 12500, seller @ 12400, both size 100.
  // Same trader on both sides (we only have one keypair). The enclave
  // doesn't care — its job is to honor the BCS-encoded sides.
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

  // Hand the plaintexts to the enclave via stdin. In production these would
  // arrive via Seal decryption inside Nitro; here we use the side channel.
  const enclaveInput = {
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
  };

  console.log("\nspawning enclave...");
  const result = spawnSync(ENCLAVE_BIN, [], {
    input: JSON.stringify(enclaveInput),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error("enclave stderr:", result.stderr);
    throw new Error(`enclave exited ${result.status}`);
  }
  const signed = JSON.parse(result.stdout);
  console.log("enclave pubkey:", signed.enclave_pubkey);
  console.log("signed matches:", signed.matches.length);

  for (const m of signed.matches) {
    console.log("\n--- match ---");
    console.log("  maker_order:", m.maker_order);
    console.log("  taker_order:", m.taker_order);
    console.log("  filled_size:", m.filled_size);
    console.log("  filled_price:", m.filled_price);
    console.log("  signature  :", m.signature.slice(0, 32) + "...");
  }

  console.log("\nNEXT (blocked on Nitro):");
  console.log("  - Register a real Enclave<SHELL> via attestation document");
  console.log("  - Call shell::attestation::verify(enclave, timestamp, ..., signature)");
  console.log("  - Call shell::settlement::settle<SUI,SUI>(instruction, maker_order, taker_order)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
