import { SealClient } from "@mysten/seal";
import { toHex } from "@mysten/sui/utils";

import { encodeOrder, type OrderPlaintext } from "./order.js";

// Use the universal Web Crypto API — works in browsers and Node 20+
const webcrypto = globalThis.crypto;

export interface EncryptOrderOptions {
  sealClient: SealClient;
  /** Shell Move package id (hex string, with or without 0x prefix). */
  shellPackageId: string;
  /** Threshold for Seal IBE; must match key-server config. */
  threshold: number;
  order: OrderPlaintext;
  /** Optional 32-byte id (random nonce). Generated if omitted. */
  id?: Uint8Array;
}

export interface EncryptedOrder {
  /** Bytes to publish on-chain as OrderCommitment.sealed_envelope.
   *  Layout: `id (32 bytes) || seal_ciphertext`. */
  sealedEnvelope: Uint8Array;
  /** SHA-256 of the BCS-encoded plaintext (commit_hash). */
  commitHash: Uint8Array;
  /** The Seal identity (nonce) used to derive the IBE key. */
  id: Uint8Array;
  /** Symmetric backup key — keep client-side for self-recovery. */
  backupKey: Uint8Array;
}

export async function encryptOrder(opts: EncryptOrderOptions): Promise<EncryptedOrder> {
  const plaintext = encodeOrder(opts.order);
  const id = opts.id ?? webcrypto.getRandomValues(new Uint8Array(32));
  const commitHash = new Uint8Array(
    await webcrypto.subtle.digest("SHA-256", plaintext as ArrayBufferView<ArrayBuffer>),
  );

  const packageId = opts.shellPackageId.startsWith("0x")
    ? opts.shellPackageId
    : `0x${opts.shellPackageId}`;
  const { encryptedObject, key } = await opts.sealClient.encrypt({
    threshold: opts.threshold,
    packageId,
    id: toHex(id),
    data: plaintext,
  });

  const sealedEnvelope = new Uint8Array(id.length + encryptedObject.length);
  sealedEnvelope.set(id, 0);
  sealedEnvelope.set(encryptedObject, id.length);

  return { sealedEnvelope, commitHash, id, backupKey: key };
}
