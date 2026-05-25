import type { ChatMessage, LlmClient, LlmDecision } from "./index.js";
import { buildSystemPrompt, buildUserMessage } from "./prompt.js";
import type { MatchProposal } from "../proposals.js";
import type { ToolCtx, ToolRegistry } from "../tools/registry.js";

const MAX_ROUNDS = 6;

/** Bounded tool-use loop. Sends the proposal + available tools, lets
 *  the model call tools iteratively, parses the final JSON decision.
 *  Hard cap of MAX_ROUNDS prevents runaway. */
export async function decideOnProposal(opts: {
  proposal: MatchProposal;
  llm: LlmClient;
  tools: ToolRegistry;
  ctx: ToolCtx;
  policy: string;
}): Promise<LlmDecision> {
  const { proposal, llm, tools, ctx, policy } = opts;
  const system = buildSystemPrompt({
    address: ctx.address,
    policy,
    side: proposal.side,
    toolsAvailable: tools.list().length > 0,
  });

  const messages: ChatMessage[] = [
    { role: "user", content: buildUserMessage(proposal) },
  ];

  const toolDefs = tools.list().length > 0 ? tools.toDefs() : undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await llm.chat({
      system,
      messages,
      tools: toolDefs,
      jsonMode: !toolDefs,             // can't combine jsonMode with tool_calls in most providers
      maxTokens: 1024,
    });

    if (res.stopReason === "tool_use" && res.toolCalls.length > 0) {
      // Push the assistant's tool-call turn into history.
      messages.push({
        role: "assistant",
        content: res.text,
        toolCalls: res.toolCalls,
      });
      // Execute each tool and push its result.
      for (const tc of res.toolCalls) {
        const result = await tools.execute(tc.name, tc.arguments, ctx);
        console.log(
          `[tool] ${tc.name}(${shortJson(tc.arguments)}) → ${shortJson(result)}`,
        );
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // Final answer.
    return parseDecision(res.text ?? "");
  }

  // Hit the round cap — force a final answer with one more call.
  console.warn(`[loop] hit round cap (${MAX_ROUNDS}); forcing final decision`);
  const final = await llm.chat({
    system: system + "\n\nYou have used your tool-call budget. Respond NOW with the final JSON object only.",
    messages,
    jsonMode: true,
    maxTokens: 512,
  });
  return parseDecision(final.text ?? "");
}

function parseDecision(text: string): LlmDecision {
  // Strip leading/trailing fences, then find the outermost JSON object.
  // Models sometimes return prose + an embedded ```json block.
  const stripped = text.trim().replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  const json = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`LLM returned non-JSON final answer: ${text}`);
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

function shortJson(v: unknown): string {
  const s = JSON.stringify(v);
  if (!s) return "";
  return s.length > 140 ? s.slice(0, 137) + "..." : s;
}
