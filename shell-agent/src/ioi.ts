import { bcs } from "@mysten/bcs";
import { SealClient } from "@mysten/seal";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";

import { config } from "./config.js";
import { putBlob } from "./walrus.js";

/** BCS schema locked to the enclave's `IoiPlaintextBcs` (mod.rs). */
const IoiPlaintextBcs = bcs.struct("IoiPlaintext", {
  side: bcs.u8(),
  asset: bcs.string(),
  size_lo: bcs.u64(),
  size_hi: bcs.u64(),
  price_lo: bcs.u64(),
  price_hi: bcs.u64(),
  expiry_ms: bcs.u64(),
});

export interface IoiPlaintext {
  side: "buy" | "sell";
  asset: string;
  sizeLo: bigint;
  sizeHi: bigint;
  priceLo: bigint;
  priceHi: bigint;
  expiryMs: bigint;
}

function encodeIoi(p: IoiPlaintext): Uint8Array {
  return IoiPlaintextBcs.serialize({
    side: p.side === "buy" ? 0 : 1,
    asset: p.asset,
    size_lo: p.sizeLo,
    size_hi: p.sizeHi,
    price_lo: p.priceLo,
    price_hi: p.priceHi,
    expiry_ms: p.expiryMs,
  }).toBytes();
}

/** Seal-encrypt the IOI plaintext under the same IBE identity Shell
 *  orders use, returning the `[id || ciphertext]` envelope. */
async function encryptIoi(
  sealClient: SealClient,
  plaintext: IoiPlaintext,
): Promise<Uint8Array> {
  const bytes = encodeIoi(plaintext);
  const id = crypto.getRandomValues(new Uint8Array(32));
  const { encryptedObject } = await sealClient.encrypt({
    threshold: 1,
    packageId: config.shellPackageId,
    id: toHex(id),
    data: bytes,
  });
  const envelope = new Uint8Array(id.length + encryptedObject.length);
  envelope.set(id, 0);
  envelope.set(encryptedObject, id.length);
  return envelope;
}

/** End-to-end: encrypt IOI → upload to Walrus → record blob_id on-chain.
 *  Returns the Walrus blob_id once the on-chain event is emitted. */
export async function postIoi(opts: {
  suiClient: SuiJsonRpcClient;
  sealClient: SealClient;
  keypair: Ed25519Keypair;
  plaintext: IoiPlaintext;
  /** Expiry epoch hint for on-chain pruning. */
  expiryEpoch: bigint;
}): Promise<{ blobId: string; digest: string }> {
  const envelope = await encryptIoi(opts.sealClient, opts.plaintext);
  const blobId = await putBlob(envelope);

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.shellPackageId}::ioi::record_ioi`,
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(blobId))),
      tx.pure.u64(opts.expiryEpoch),
    ],
  });

  const result = await opts.suiClient.signAndExecuteTransaction({
    signer: opts.keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(
      `record_ioi failed: ${result.effects?.status?.error ?? "unknown"}`,
    );
  }
  return { blobId, digest: result.digest };
}

export { IoiPlaintextBcs };
