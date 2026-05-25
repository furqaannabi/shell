import { config } from "../config.js";
import { OpenAILlmClient } from "./openai.js";
import { AnthropicLlmClient } from "./anthropic.js";
import { GoogleLlmClient } from "./google.js";
import type { MatchProposal } from "../proposals.js";

// ── Provider-neutral chat interface ────────────────────────────────────

export type LlmProvider = "openai" | "anthropic" | "google" | "openai-compatible";

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema object describing the tool's arguments. */
  parameters: unknown;
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ChatResult {
  text: string | null;
  toolCalls: ToolCall[];
  stopReason: "stop" | "tool_use" | "length";
}

export interface ChatOpts {
  system: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "required" | "none";
  /** JSON-mode hint — providers that support it will force JSON output. */
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface LlmClient {
  chat(opts: ChatOpts): Promise<ChatResult>;
}

// ── Factory ────────────────────────────────────────────────────────────

/** Build an LlmClient from current config. Backward-compat: if
 *  `LLM_PROVIDER` is unset and `OPENAI_API_KEY` is set, defaults to
 *  OpenAI + gpt-4o-mini so existing .env files keep working. */
export function makeLlmClient(): LlmClient {
  const provider = resolveProvider();
  const apiKey = config.llmApiKey || config.openaiApiKey;
  if (!apiKey) {
    throw new Error(
      "no LLM API key — set LLM_API_KEY (or legacy OPENAI_API_KEY)",
    );
  }
  const model = config.llmModel || config.openaiModel;
  switch (provider) {
    case "openai":
    case "openai-compatible":
      return new OpenAILlmClient({
        apiKey,
        model,
        baseUrl: config.llmBaseUrl || undefined,
      });
    case "anthropic":
      return new AnthropicLlmClient({ apiKey, model });
    case "google":
      return new GoogleLlmClient({ apiKey, model });
  }
}

function resolveProvider(): LlmProvider {
  if (config.llmProvider) {
    const p = config.llmProvider.toLowerCase();
    if (p === "openai" || p === "anthropic" || p === "google" || p === "openai-compatible") {
      return p;
    }
    throw new Error(`unknown LLM_PROVIDER=${config.llmProvider}`);
  }
  // Legacy fallback — pre-v2 .env only has OPENAI_API_KEY.
  return "openai";
}

// ── High-level helper retained for step 1 (single-shot, no tools) ──────

export interface LlmDecision {
  decision: "accept_match" | "reject_match" | "wait";
  reasoning: string;
  /** True iff the decision provably stays within declared policy. The
   *  agent escalates to human approval when this is false. */
  policy_check: boolean;
}

/** Single-shot JSON evaluation — same contract as the pre-v2 helper.
 *  Step 2 replaces callers with `decideOnProposal()` (tool-use loop).
 *  Kept here so agent.ts/demo.ts continue working unchanged in step 1. */
export async function evaluateProposal(
  proposal: MatchProposal,
  policyOverride?: string,
  client?: LlmClient,
): Promise<LlmDecision> {
  const llm = client ?? makeLlmClient();
  const system =
    "You are a trading agent. Your policy is: " +
    (policyOverride ?? config.agentPolicy) +
    "\n\nReply with ONLY a single JSON object matching this schema:" +
    " {decision: 'accept_match'|'reject_match'|'wait', reasoning: string, policy_check: boolean}." +
    " Set policy_check=true only if the decision provably stays within the declared policy.";

  const user =
    `Match proposal (your side = ${proposal.side}):\n` +
    `  asset: ${proposal.asset}\n` +
    `  agreed_price: ${proposal.agreedPrice}\n` +
    `  agreed_size: ${proposal.agreedSize}\n` +
    `  counterparty: ${proposal.side === "buy" ? proposal.sellAgent : proposal.buyAgent}\n` +
    `  expiry_ms: ${proposal.expiryMs}\n` +
    `Decide.`;

  const res = await llm.chat({
    system,
    messages: [{ role: "user", content: user }],
    jsonMode: true,
    maxTokens: 512,
  });

  const text = res.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`LLM returned non-JSON: ${text}`);
  }
  const obj = parsed as Record<string, unknown>;
  const decision = obj.decision as LlmDecision["decision"];
  if (!["accept_match", "reject_match", "wait"].includes(decision)) {
    throw new Error(`LLM bad decision: ${JSON.stringify(parsed)}`);
  }
  return {
    decision,
    reasoning: String(obj.reasoning ?? ""),
    policy_check: Boolean(obj.policy_check),
  };
}
