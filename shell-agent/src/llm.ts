import OpenAI from "openai";

import { config } from "./config.js";
import type { MatchProposal } from "./proposals.js";

const client = new OpenAI({ apiKey: config.openaiApiKey });

export interface LlmDecision {
  decision: "accept_match" | "reject_match" | "wait";
  reasoning: string;
  /** True iff the decision provably stays within declared policy. The
   *  agent escalates to human approval when this is false. */
  policy_check: boolean;
}

/** Ask GPT to evaluate a match proposal against the agent's declared
 *  policy. `policyOverride` replaces `config.agentPolicy` when provided. */
export async function evaluateProposal(
  proposal: MatchProposal,
  policyOverride?: string,
): Promise<LlmDecision> {
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

  const res = await client.chat.completions.create({
    model: config.openaiModel,
    response_format: { type: "json_object" },
    max_tokens: 512,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = res.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
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
