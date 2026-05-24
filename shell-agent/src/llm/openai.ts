import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import type {
  ChatMessage,
  ChatOpts,
  ChatResult,
  LlmClient,
  ToolCall,
} from "./index.js";

export class OpenAILlmClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model: string; baseUrl?: string }) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseUrl,
    });
    this.model = opts.model;
  }

  async chat(opts: ChatOpts): Promise<ChatResult> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: opts.system },
      ...opts.messages.map(toOpenAIMessage),
    ];

    const tools: ChatCompletionTool[] | undefined = opts.tools?.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      ...(tools ? { tools } : {}),
      ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      max_tokens: opts.maxTokens ?? 512,
    });

    const choice = res.choices[0];
    if (!choice) throw new Error("OpenAI returned no choices");
    const msg = choice.message;

    const toolCalls: ToolCall[] = (msg.tool_calls ?? [])
      .filter((tc) => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeJsonParse(tc.function.arguments),
      }));

    const stopReason: ChatResult["stopReason"] =
      choice.finish_reason === "tool_calls"
        ? "tool_use"
        : choice.finish_reason === "length"
          ? "length"
          : "stop";

    return {
      text: msg.content ?? null,
      toolCalls,
      stopReason,
    };
  }
}

function toOpenAIMessage(m: ChatMessage): ChatCompletionMessageParam {
  switch (m.role) {
    case "system":
    case "user":
      return { role: m.role, content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments ?? {}),
                },
              })),
            }
          : {}),
      };
    case "tool":
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      };
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
