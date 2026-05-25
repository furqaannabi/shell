import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool as AnthropicTool,
  ToolResultBlockParam,
  ToolUseBlock,
  ContentBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

import type {
  ChatMessage,
  ChatOpts,
  ChatResult,
  LlmClient,
  ToolCall,
} from "./index.js";

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
  }

  async chat(opts: ChatOpts): Promise<ChatResult> {
    const tools: AnthropicTool[] | undefined = opts.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as AnthropicTool["input_schema"],
    }));

    const res = await this.client.messages.create({
      model: this.model,
      system: opts.system,
      messages: opts.messages.flatMap(toAnthropicMessage),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(opts.toolChoice === "required" ? { tool_choice: { type: "any" } } : {}),
      max_tokens: opts.maxTokens ?? 1024,
    });

    const toolCalls: ToolCall[] = res.content
      .filter((b): b is ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, arguments: b.input }));

    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : null;

    const stopReason: ChatResult["stopReason"] =
      res.stop_reason === "tool_use"
        ? "tool_use"
        : res.stop_reason === "max_tokens"
          ? "length"
          : "stop";

    return { text, toolCalls, stopReason };
  }
}

function toAnthropicMessage(m: ChatMessage): MessageParam[] {
  switch (m.role) {
    case "system":
      // System messages go via the top-level `system` param; skip here.
      return [];
    case "user":
      return [{ role: "user", content: m.content }];
    case "assistant": {
      const content: ContentBlockParam[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments as Record<string, unknown>,
        });
      }
      return [{ role: "assistant", content }];
    }
    case "tool": {
      const block: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
      };
      return [{ role: "user", content: [block] }];
    }
  }
}
