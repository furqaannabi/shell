import { bcs } from "@mysten/bcs";
import type { SuiEvent, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

import { config } from "./config.js";
import { getBlob } from "./walrus.js";

// v2 schema: includes match_id
const MatchProposalBcs = bcs.struct("MatchProposal", {
  buy_agent: bcs.bytes(32),
  sell_agent: bcs.bytes(32),
  asset: bcs.string(),
  agreed_price: bcs.u64(),
  agreed_size: bcs.u64(),
  expiry_ms: bcs.u64(),
  match_id: bcs.u64(),
});

// v1 schema: legacy blobs without match_id
const MatchProposalBcsV1 = bcs.struct("MatchProposalV1", {
  buy_agent: bcs.bytes(32),
  sell_agent: bcs.bytes(32),
  asset: bcs.string(),
  agreed_price: bcs.u64(),
  agreed_size: bcs.u64(),
  expiry_ms: bcs.u64(),
});

function parseProposalBytes(bytes: Uint8Array): { buy_agent: Uint8Array; sell_agent: Uint8Array; asset: string; agreed_price: bigint; agreed_size: bigint; expiry_ms: bigint; match_id: bigint } {
  try {
    const p = MatchProposalBcs.parse(bytes);
    return { ...p, agreed_price: BigInt(p.agreed_price), agreed_size: BigInt(p.agreed_size), expiry_ms: BigInt(p.expiry_ms), match_id: BigInt(p.match_id) };
  } catch {
    const p = MatchProposalBcsV1.parse(bytes);
    return { ...p, agreed_price: BigInt(p.agreed_price), agreed_size: BigInt(p.agreed_size), expiry_ms: BigInt(p.expiry_ms), match_id: BigInt(0) };
  }
}

export interface MatchProposal {
  buyAgent: string;
  sellAgent: string;
  asset: string;
  agreedPrice: bigint;
  agreedSize: bigint;
  expiryMs: bigint;
  matchId: bigint;
  /** Which side is *this* agent on this proposal. */
  side: "buy" | "sell";
  /** Walrus blob_id the proposal was fetched from (for journal links). */
  blobId: string;
}

function bytesToAddress(b: Uint8Array | number[]): string {
  const arr = Array.from(b);
  const hex = arr.map((n) => n.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

/** Poll `MatchProposed` events filtered to where `agent_addr` is one of
 *  the two parties. Returns proposals as plaintext with side resolved. */
export async function pollProposals(opts: {
  suiClient: SuiJsonRpcClient;
  agentAddr: string;
  /** Blob IDs to skip. 404-expired blobs are added here so they're never retried. */
  skipBlobIds?: Set<string>;
}): Promise<{ proposals: MatchProposal[] }> {
  // Always query from the latest end (no cursor) — descending means newest first.
  // seenProposals in the caller handles deduplication across ticks.
  // Using a cursor with descending order would drift backwards through history,
  // causing new events to be missed entirely.
  const eventType = `${config.shellPackageIdIoiTypes}::ioi::MatchProposed`;
  const res = await opts.suiClient.queryEvents({
    query: { MoveEventType: eventType },
    cursor: null,
    limit: 50,
    order: "descending",
  });

  const proposals: MatchProposal[] = [];
  for (const ev of res.data as SuiEvent[]) {
    const j = ev.parsedJson as Record<string, unknown>;
    const buyAgent = (j.buy_agent as string).toLowerCase();
    const sellAgent = (j.sell_agent as string).toLowerCase();
    const me = opts.agentAddr.toLowerCase();
    let side: "buy" | "sell";
    let blobId: string;
    if (buyAgent === me) {
      side = "buy";
      blobId = decodeBlobId(j.buy_blob_id);
    } else if (sellAgent === me) {
      side = "sell";
      blobId = decodeBlobId(j.sell_blob_id);
    } else {
      continue;
    }

    if (opts.skipBlobIds?.has(blobId)) continue;

    try {
      const bytes = await getBlob(blobId);
      const decoded = parseProposalBytes(bytes);
      proposals.push({
        buyAgent: bytesToAddress(decoded.buy_agent),
        sellAgent: bytesToAddress(decoded.sell_agent),
        asset: decoded.asset,
        agreedPrice: decoded.agreed_price,
        agreedSize: decoded.agreed_size,
        expiryMs: decoded.expiry_ms,
        matchId: decoded.match_id,
        side,
        blobId,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (opts.skipBlobIds && msg.includes('404')) {
        opts.skipBlobIds.add(blobId);
      }
      console.error(`[proposals] fetch/decode ${blobId}: ${msg}`);
    }
  }

  return { proposals };
}

function decodeBlobId(v: unknown): string {
  // Sui events can return vector<u8> as either an array of numbers or a hex string.
  if (typeof v === "string") {
    const stripped = v.startsWith("0x") ? v.slice(2) : v;
    const bytes = new Uint8Array(stripped.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  }
  if (Array.isArray(v)) {
    return new TextDecoder().decode(new Uint8Array(v as number[]));
  }
  throw new Error(`unparseable blob_id: ${JSON.stringify(v)}`);
}
