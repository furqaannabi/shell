import { GoogleGenAI } from "@google/genai";
import type {
  Content,
  FunctionDeclaration,
  Tool as GoogleTool,
  Part,
} from "@google/genai";

import type {
  ChatMessage,
  ChatOpts,
  ChatResult,
  LlmClient,
  ToolCall,
} from "./index.js";

export class GoogleLlmClient implements LlmClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model: string }) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
    this.model = opts.model;
  }

  async chat(opts: ChatOpts): Promise<ChatResult> {
    const tools: GoogleTool[] | undefined = opts.tools?.map((t) => ({
      functionDeclarations: [
        {
          name: t.name,
          description: t.description,
          parameters: t.parameters as FunctionDeclaration["parameters"],
        },
      ],
    }));

    const contents: Content[] = opts.messages.flatMap(toGoogleContent);

    const res = await this.client.models.generateContent({
      model: this.model,
      contents,
      ...(tools && tools.length > 0 ? { tools } : {}),
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 1024,
        ...(opts.jsonMode
          ? { responseMimeType: "application/json" }
          : {}),
      },
    });

    const candidate = res.candidates?.[0];
    const parts: Part[] = candidate?.content?.parts ?? [];

    const toolCalls: ToolCall[] = parts
      .filter((p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } =>
        p.functionCall != null,
      )
      .map((p, i) => ({
        id: `fc-${i}`,
        name: p.functionCall.name ?? "",
        arguments: p.functionCall.args ?? {},
      }));

    const textParts = parts.filter((p) => p.text != null).map((p) => p.text!);
    const text = textParts.length > 0 ? textParts.join("") : null;

    const finishReason = candidate?.finishReason;
    const stopReason: ChatResult["stopReason"] =
      toolCalls.length > 0
        ? "tool_use"
        : finishReason === "MAX_TOKENS"
          ? "length"
          : "stop";

    return { text, toolCalls, stopReason };
  }
}

function toGoogleContent(m: ChatMessage): Content[] {
  switch (m.role) {
    case "system":
      // Passed via systemInstruction; skip here.
      return [];
    case "user":
      return [{ role: "user", parts: [{ text: m.content }] }];
    case "assistant": {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments as Record<string, unknown>,
          },
        });
      }
      return [{ role: "model", parts }];
    }
    case "tool":
      return [
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: m.name,
                response: safeJsonParse(m.content) as Record<string, unknown>,
              },
            },
          ],
        },
      ];
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { text: s };
  }
}
