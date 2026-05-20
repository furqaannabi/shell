import { putBlob } from "./walrus.js";
import type { LlmDecision } from "./llm.js";
import type { MatchProposal } from "./proposals.js";

/** Snapshot of a proposal with BigInts stringified for stable JSON. */
export type ProposalSnapshot = Omit<
  MatchProposal,
  "agreedPrice" | "agreedSize" | "expiryMs"
> & {
  agreedPrice: string;
  agreedSize: string;
  expiryMs: string;
};

export interface JournalEntry {
  timestamp_ms: number;
  agent_id: string;
  event: "ioi_posted" | "proposal_received" | "decision" | "order_submitted";
  proposal?: ProposalSnapshot;
  decision?: LlmDecision;
  /** Hex digest of the action taken (e.g. Sui tx digest). */
  action_digest?: string;
  notes?: string;
}

/** Append a JSON-Lines entry to Walrus. Each entry is its own blob in
 *  v1; v1.1 will roll a daily aggregate blob with prev-blob pointer. */
export async function appendEntry(entry: JournalEntry): Promise<string> {
  // BigInts in proposal need stringification.
  const safe = JSON.stringify(entry, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  const blobId = await putBlob(new TextEncoder().encode(safe + "\n"));
  return blobId;
}
