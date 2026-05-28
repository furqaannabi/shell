import { bcs } from '@mysten/bcs';
import type { SealClient } from '@mysten/seal';
import { toHex } from '@mysten/sui/utils';

/** BCS schema locked to the enclave's `IoiPlaintextBcs` (mod.rs) and
 *  the shell-agent daemon's `IoiPlaintextBcs` (ioi.ts). */
export const IoiPlaintextBcs = bcs.struct('IoiPlaintext', {
  side: bcs.u8(),
  asset: bcs.string(),
  size_lo: bcs.u64(),
  size_hi: bcs.u64(),
  price_lo: bcs.u64(),
  price_hi: bcs.u64(),
  expiry_ms: bcs.u64(),
});

/** Plaintext IOI shape used in the browser UI. All sizes/prices are in
 *  base units (1e9-scaled for prices, raw u64 for sizes). */
export interface IoiPlaintext {
  side: 'buy' | 'sell';
  asset: string;
  sizeLo: bigint;
  sizeHi: bigint;
  priceLo: bigint;
  priceHi: bigint;
  expiryMs: bigint;
}

// v2: includes match_id (enclave ≥ this commit)
export const MatchProposalBcs = bcs.struct('MatchProposal', {
  buy_agent: bcs.bytes(32),
  sell_agent: bcs.bytes(32),
  asset: bcs.string(),
  agreed_price: bcs.u64(),
  agreed_size: bcs.u64(),
  expiry_ms: bcs.u64(),
  match_id: bcs.u64(),
});

// v1: legacy blobs produced before match_id was added
const MatchProposalBcsV1 = bcs.struct('MatchProposalV1', {
  buy_agent: bcs.bytes(32),
  sell_agent: bcs.bytes(32),
  asset: bcs.string(),
  agreed_price: bcs.u64(),
  agreed_size: bcs.u64(),
  expiry_ms: bcs.u64(),
});

/** Parse a Walrus blob, trying v2 schema first then falling back to v1.
 *  Legacy blobs (no match_id) get match_id = 0. */
export function parseMatchProposal(bytes: Uint8Array): {
  buy_agent: Uint8Array;
  sell_agent: Uint8Array;
  asset: string;
  agreed_price: bigint;
  agreed_size: bigint;
  expiry_ms: bigint;
  match_id: bigint;
} {
  try {
    const p = MatchProposalBcs.parse(bytes);
    return {
      buy_agent: p.buy_agent,
      sell_agent: p.sell_agent,
      asset: p.asset,
      agreed_price: BigInt(p.agreed_price),
      agreed_size: BigInt(p.agreed_size),
      expiry_ms: BigInt(p.expiry_ms),
      match_id: BigInt(p.match_id),
    };
  } catch {
    const p = MatchProposalBcsV1.parse(bytes);
    return {
      buy_agent: p.buy_agent,
      sell_agent: p.sell_agent,
      asset: p.asset,
      agreed_price: BigInt(p.agreed_price),
      agreed_size: BigInt(p.agreed_size),
      expiry_ms: BigInt(p.expiry_ms),
      match_id: BigInt(0),
    };
  }
}

export function encodeIoi(p: IoiPlaintext): Uint8Array {
  return IoiPlaintextBcs.serialize({
    side: p.side === 'buy' ? 0 : 1,
    asset: p.asset,
    size_lo: p.sizeLo,
    size_hi: p.sizeHi,
    price_lo: p.priceLo,
    price_hi: p.priceHi,
    expiry_ms: p.expiryMs,
  }).toBytes();
}

/** Seal-encrypt the BCS-encoded IOI under the Shell enclave identity.
 *  Returns the `[id || ciphertext]` envelope ready to PUT to Walrus. */
export async function encryptIoi(
  sealClient: SealClient,
  shellPackageId: string,
  plaintext: IoiPlaintext,
): Promise<Uint8Array> {
  const bytes = encodeIoi(plaintext);
  const id = crypto.getRandomValues(new Uint8Array(32));
  const { encryptedObject } = await sealClient.encrypt({
    threshold: 1,
    packageId: shellPackageId,
    id: toHex(id),
    data: bytes,
  });
  const envelope = new Uint8Array(id.length + encryptedObject.length);
  envelope.set(id, 0);
  envelope.set(encryptedObject, id.length);
  return envelope;
}
