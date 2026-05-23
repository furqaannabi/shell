import { bcs } from "@mysten/bcs";
import type { SuiEvent, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

import { config } from "./config.js";
import { getBlob } from "./walrus.js";

/** BCS schema locked to the enclave's `MatchProposalPlaintext`. */
const MatchProposalBcs = bcs.struct("MatchProposal", {
  buy_agent: bcs.bytes(32),
  sell_agent: bcs.bytes(32),
  asset: bcs.string(),
  agreed_price: bcs.u64(),
  agreed_size: bcs.u64(),
  expiry_ms: bcs.u64(),
});

export interface MatchProposal {
  buyAgent: string;
  sellAgent: string;
  asset: string;
  agreedPrice: bigint;
  agreedSize: bigint;
  expiryMs: bigint;
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
  cursor?: { txDigest: string; eventSeq: string };
}): Promise<{
  proposals: MatchProposal[];
  nextCursor: { txDigest: string; eventSeq: string } | null;
}> {
  // IOI module was introduced in v2 (0x68aae56c…). Event type identity
  // sticks to the defining package even after subsequent upgrades, so we
  // can't use the *current* latest id here.
  const eventType = `${config.shellPackageIdIoiTypes}::ioi::MatchProposed`;
  const res = await opts.suiClient.queryEvents({
    query: { MoveEventType: eventType },
    cursor: opts.cursor ?? null,
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

    try {
      const bytes = await getBlob(blobId);
      const decoded = MatchProposalBcs.parse(bytes);
      proposals.push({
        buyAgent: bytesToAddress(decoded.buy_agent),
        sellAgent: bytesToAddress(decoded.sell_agent),
        asset: decoded.asset,
        agreedPrice: BigInt(decoded.agreed_price),
        agreedSize: BigInt(decoded.agreed_size),
        expiryMs: BigInt(decoded.expiry_ms),
        side,
        blobId,
      });
    } catch (e) {
      console.error(`[proposals] fetch/decode ${blobId}: ${(e as Error).message}`);
    }
  }

  return {
    proposals,
    nextCursor: res.hasNextPage && res.nextCursor ? res.nextCursor : null,
  };
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
