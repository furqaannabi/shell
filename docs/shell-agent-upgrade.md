# Plan: shell-agent v2 — Pluggable LLM + Built-in Tools + MCP/Plugin Support

## Context

Phase 1 (IOI → enclave match → settle_direct) is shipped. The `shell-agent` Node daemon already does the loop end-to-end via `run`, `demo`, `post-ioi`, and `accept-once` modes.

Today `shell-agent/src/llm.ts` is a single-shot OpenAI call: it gets the proposal + a free-text policy and nothing else. No tool use, no market data, no risk awareness, no extensibility. A real quant can't ask "what's the DeepBook ref price right now?" or "what's my net position so far today?" — the model only sees what `evaluateProposal` hands it.

v2 turns shell-agent into an extensible agent platform without changing what's already running:

- **Pluggable LLM provider** — BYO key/model/URL (OpenAI, Anthropic, Google, or any OpenAI-compatible endpoint).
- **Built-in trading tools** — curated, shell-finance-aware tools the LLM can call (ref price, balance, open orders, recent fills, risk cap, cancel, journal).
- **Local plugin loader** — drop a TS file in `shell-agent/plugins/`, it auto-registers as a tool. For quick custom data feeds without spinning up an MCP server.
- **MCP client** — Claude-Desktop-style `mcp.json` to attach any external MCP server.
- **First-party `shell-mcp`** — new `mcp/shell-mcp/` package exposing the read-only trading-data tools (ref price, balances, active orders/proposals, recent fills) over MCP so Claude Desktop / Cursor / etc. can use them too. Mirrors `mcp/walrus-mcp/`'s structure (stdio + streamable HTTP). Address is a parameter — never holds a private key, so write actions like `cancel_order` stay in-process inside shell-agent only.

The agent stays a thin shell-finance-aware harness; everything else composes around it. Loop shape in `agent.ts` / `demo.ts` is unchanged — only the LLM call site swaps.

## Architecture

```
                    agent.ts / demo.ts (loop unchanged)
                              │
                              ▼
                   llm/loop.ts  ─── decideOnProposal()
                   ┌────────┴────────┐
                   │                 │
                   ▼                 ▼
             LlmClient        ToolRegistry
        ┌───┬───┴───┬────┐    ┌─────┴──────┬──────────┐
        ▼   ▼       ▼    ▼    ▼            ▼          ▼
     openai anthropic google  builtin/*  plugins/*  mcp.json
     (existing)  (new)  (new) (10 tools) (auto-     (stdio +
                                          discover)  HTTP)
                              │            │          │
                              ▼            ▼          ▼
                         suiClient,   user TS    @modelcontext
                         sealClient,  files       protocol/sdk
                         queries,                 client
                         DeepBook,
                         Walrus
```

Tool names are namespaced — built-ins keep their bare name (`get_ref_price`), plugins get `plugin__<name>`, MCP tools get `mcp__<server>__<tool>`. The LLM sees one flat tool list; the registry routes each call to its source.

## What already exists (reuse, don't rebuild)

| File                                           | What it gives us                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell-agent/src/agent.ts`                     | The `while(true)` loop — post IOI → poll proposals → LLM eval → submit. Only the LLM call site changes.                                                          |
| `shell-agent/src/demo.ts`                      | Multi-wallet demo; calls `evaluateProposal` in two places (synthetic-bad-proposal step, real-proposal step). Both swap to new entry point.                       |
| `shell-agent/src/llm.ts`                       | Existing single-shot OpenAI call. Becomes the OpenAI adapter under `llm/openai.ts`.                                                                              |
| `shell-agent/src/proposals.ts`                 | `pollProposals` + `MatchProposalBcs` schema — reused inside `get_my_active_proposals` tool.                                                                      |
| `shell-agent/src/ioi.ts`                       | `postIoi` — agent.ts keeps calling it.                                                                                                                           |
| `shell-agent/src/orders.ts`                    | `submitOrderFromProposal` — unchanged.                                                                                                                           |
| `shell-agent/src/journal.ts`                   | `appendEntry` already writes; reuse for `append_journal` tool. `read_journal` needs a new aggregator (single-blob-per-entry today).                              |
| `shell-agent/src/walrus.ts`                    | `putBlob` / `getBlob`.                                                                                                                                           |
| `@shell-finance/sdk` → `ts-sdk/src/queries.ts` | `getActiveOrders`, `getReceipts` — back `get_my_active_orders` / `get_my_recent_fills`.                                                                          |
| `web/src/components/agent/IOIForm.tsx:29-46`   | `fetchMidPrice` against `${DEEPBOOK_INDEXER_URL}/orderbook/${DEEPBOOK_POOL_KEY}?level=2&depth=2`. Lift verbatim into `get_ref_price`.                            |
| `web/src/lib/sui.ts`                           | DeepBook constants (`deepbookIndexerUrl`, `deepbookPoolKey = "SUI_DBUSDC"`). Mirror into shell-agent's config.                                                   |
| `move/sources/pool.move:98`                    | `cancel_anytime<T>` — backs `cancel_order` tool via a new helper.                                                                                                |
| `mcp/walrus-mcp/`                              | Reference for MCP SDK use; we already depend on `@modelcontextprotocol/sdk@^1.29.0` + `zod@^3.25` elsewhere in the repo, so versions can be pinned consistently. |

## Design

### A. Pluggable LLM provider

`shell-agent/src/llm/index.ts` defines a provider-neutral interface:

```ts
export interface LlmClient {
  chat(opts: {
    system: string;
    messages: ChatMessage[];
    tools?: ToolDef[];
    toolChoice?: "auto" | "required";
  }): Promise<ChatResult>;
}
export interface ChatResult {
  text: string | null;
  toolCalls: { id: string; name: string; arguments: unknown }[];
  stopReason: "stop" | "tool_use" | "length";
}
```

Adapters in `llm/openai.ts`, `llm/anthropic.ts`, `llm/google.ts`. Each translates internal `ToolDef`/`ToolCall` shape into the provider's tool-use payload and back. `openai-compatible` mode reuses the OpenAI adapter with `baseURL` set, so Ollama / vLLM / OpenRouter / Together work for free.

Env additions (all optional, with backward-compat fallback to today's behaviour):

```
LLM_PROVIDER=openai           # openai | anthropic | google | openai-compatible
LLM_MODEL=gpt-4o-mini         # any model id the provider accepts
LLM_API_KEY=                  # whatever key the chosen provider needs
LLM_BASE_URL=                 # optional override (e.g. https://openrouter.ai/api/v1)
```

If `LLM_PROVIDER` is unset and `OPENAI_API_KEY` is set, default to `openai` + `gpt-4o-mini`. This means existing `.env` files keep working with zero changes.

### B. Tool-use loop

`shell-agent/src/llm/loop.ts` replaces the single-shot call:

```
decideOnProposal({ proposal, llm, tools, policy, ctx }) →
  1. messages = [user(proposalDescription)]
  2. loop (max 6 rounds):
       result = llm.chat({system, messages, tools: tools.toDefs()})
       if result.stopReason == 'tool_use':
         for each toolCall: out = tools.execute(name, args, ctx)
         messages.push(assistantToolCalls, toolResults)
         continue
       else:  # stop or length
         parse JSON from result.text → LlmDecision
         return
  3. on round-cap: append "respond with final decision now" + force toolChoice:'none' → one more turn, parse.
```

Each tool's `execute` is wrapped to catch errors and return `{ error: "..." }` — the LLM can react rather than the loop crashing.

`llm/prompt.ts` builds the system prompt: states the agent's side + address + policy, lists tools, instructs the model to verify policy via tools before deciding, and pins the final JSON shape (`{decision, reasoning, policy_check}`).

### C. Built-in tools

Registered in `shell-agent/src/tools/builtin.ts`. Each: `{ name, description, parameters: ZodSchema, execute(args, ctx) }`. `ctx = {suiClient, sealClient, keypair, config}` is passed once into the registry on agent start — no globals.

| Tool                      | Returns                                                                             | Backing impl                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_ref_price`           | `{ bid, ask, mid }` for SUI/USDC                                                    | port `fetchMidPrice` from `IOIForm.tsx:29-46` into a fetch against `config.deepbookIndexerUrl`                                                                              |
| `get_my_balance`          | `{ sui, usdc }` raw u64                                                             | two `suiClient.getBalance` calls (mirror `demo.ts:logBalances`)                                                                                                             |
| `get_my_active_orders`    | `ActiveOrder[]`                                                                     | `getActiveOrders(suiClient, {shellPackageId, trader: addr})` from ts-sdk                                                                                                    |
| `get_my_active_proposals` | `MatchProposal[]`                                                                   | reuse `pollProposals({suiClient, agentAddr})` from `proposals.ts`                                                                                                           |
| `get_my_recent_fills`     | last N `SettlementReceipt` fields                                                   | `getReceipts(suiClient, {shellPackageId, owner: addr})` then slice                                                                                                          |
| `cancel_order`            | tx digest                                                                           | new `shell-agent/src/cancel.ts`: PTB calling `${shellPackageIdLatest}::pool::cancel_anytime<T>(order)` with `T` looked up via `get_my_active_orders` (or passed by the LLM) |
| `check_risk_cap`          | `{within_cap, current_position_sui, daily_volume_sui, cap_position_sui, cap_daily}` | aggregate from `getReceipts` + `getActiveOrders` against `RISK_MAX_POSITION_SUI`/`RISK_DAILY_VOLUME_SUI` env                                                                |
| `read_journal`            | last N JournalEntry objects                                                         | needs new index — see note below                                                                                                                                            |
| `append_journal`          | blobId                                                                              | thin wrapper over `appendEntry`                                                                                                                                             |
| `notify_webhook`          | `{ok}`                                                                              | POSTs JSON to `WEBHOOK_URL` env if set; no-op + warning if not                                                                                                              |

**`read_journal` note:** today `appendEntry` writes one blob per entry with no index — there's nothing to read back. v2 ships `read_journal` as an in-memory cursor: the agent keeps an in-process array of blobIds it has written this session, and `read_journal` returns those. A persistent index (rolling daily-aggregate blob with prev-pointer) is the v1.1 follow-up noted in `journal.ts:27` — out of scope here.

Each tool's `description` field is what the LLM sees, so it gets a one-liner of when to use it (e.g. "Call before evaluating size/price to verify they're sensible against current market.").

### D. Local plugin loader

For users who want a custom tool without an MCP server: drop a TS/JS file under `shell-agent/plugins/`. Auto-discovered at startup, registered as `plugin__<name>`.

Convention — each file default-exports a `Tool` (or `Tool[]`):

```ts
// shell-agent/plugins/my_oracle.ts
import type { Tool } from "../src/tools/registry.js";
import { z } from "zod";

const myOracle: Tool = {
  name: "my_oracle",
  description: "Fair value for SUI/USDC from my private oracle.",
  parameters: z.object({}),
  async execute(_args, _ctx) {
    const res = await fetch("https://my-oracle.example.com/sui-usdc");
    return await res.json();
  },
};
export default myOracle;
```

Loader (`shell-agent/src/tools/plugins.ts`):

1. Read `shell-agent/plugins/*.{ts,js,mjs}` on startup (skip silently if dir missing).
2. `await import()` each — take `default` export.
3. Validate `{name, description, parameters, execute}`; skip with `console.warn` on bad files.
4. Register as `plugin__<name>` in the tool registry.
5. Plugins get the same `ctx` as built-ins.

shell-agent already compiles with `tsc`, but plugins ideally run untranspiled — add `tsx` as a runtime dep and prefer `tsx` as the entrypoint runner when plugins are present. Compiled `.js`/`.mjs` plugins also work via plain `import()` against `dist/`. Document both paths in `plugins/README.md`.

`plugins/` is gitignored except for `plugins/README.md` (worked example, checked in).

Security note: plugins run in-process with full agent privileges (signs as the agent, holds the Seal client). Same trust boundary as MCP servers — `README.md` says this loudly.

### E. MCP client

`shell-agent/mcp.json` (gitignored), with `mcp.example.json` checked in:

```json
{
  "mcpServers": {
    "walrus": {
      "transport": "http",
      "url": "https://sui.furqaannabi.com/mcp"
    },
    "my-pyth-feed": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "pyth-mcp-server"],
      "env": { "PYTH_NETWORK": "testnet" }
    }
  }
}
```

`shell-agent/src/tools/mcp.ts`:

1. On startup: read `mcp.json` (skip silently if missing).
2. For each entry: spawn `StdioClientTransport` or open `StreamableHTTPClientTransport` via `@modelcontextprotocol/sdk` (same version `walrus-mcp` uses: `^1.29.0`).
3. `client.listTools()` → register each as `mcp__<server>__<tool>` in the registry. Parameters schema bridges from MCP JSON Schema to a zod-equivalent at registration time (or the registry stores raw JSON Schema and only converts to per-provider format inside each adapter — simpler).
4. On `execute(args)`: `client.callTool({name: <toolName>, arguments: args})`, return `result.content`.
5. On SIGTERM / loop exit: `client.close()` for all.

## File map

| File                                    | Change                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shell-agent/src/llm.ts`                | DELETE — replaced by `llm/` dir.                                                                                                                                                                                   |
| NEW `shell-agent/src/llm/index.ts`      | `LlmClient` interface + `makeLlmClient()` factory dispatching on `LLM_PROVIDER`.                                                                                                                                   |
| NEW `shell-agent/src/llm/openai.ts`     | Port current `evaluateProposal` body here; add tool-call translation.                                                                                                                                              |
| NEW `shell-agent/src/llm/anthropic.ts`  | `@anthropic-ai/sdk` adapter.                                                                                                                                                                                       |
| NEW `shell-agent/src/llm/google.ts`     | `@google/genai` adapter (current SDK; `@google/generative-ai` is deprecated).                                                                                                                                      |
| NEW `shell-agent/src/llm/loop.ts`       | Bounded tool-use loop, parses final JSON `LlmDecision`. Exports `decideOnProposal()`.                                                                                                                              |
| NEW `shell-agent/src/llm/prompt.ts`     | System prompt builder.                                                                                                                                                                                             |
| NEW `shell-agent/src/tools/registry.ts` | `ToolRegistry` (register/list/execute by name) + `Tool` type.                                                                                                                                                      |
| NEW `shell-agent/src/tools/builtin.ts`  | All 10 built-ins wired up.                                                                                                                                                                                         |
| NEW `shell-agent/src/tools/webhook.ts`  | `notify_webhook`.                                                                                                                                                                                                  |
| NEW `shell-agent/src/tools/plugins.ts`  | Auto-load `plugins/*.{ts,js,mjs}`.                                                                                                                                                                                 |
| NEW `shell-agent/src/tools/mcp.ts`      | `mcp.json` loader + client lifecycle.                                                                                                                                                                              |
| NEW `shell-agent/src/cancel.ts`         | `cancelOrder({suiClient, keypair, orderId, collateralType})` using `cancel_anytime` on `shellPackageIdLatest`.                                                                                                     |
| `shell-agent/src/agent.ts`              | Build registry + `LlmClient` once at startup; swap `evaluateProposal(p)` for `decideOnProposal({proposal: p, llm, tools, policy: config.agentPolicy})`.                                                            |
| `shell-agent/src/demo.ts`               | Same swap (both call sites — synthetic-bad step + real-proposal step).                                                                                                                                             |
| `shell-agent/src/config.ts`             | Add `llmProvider`, `llmModel`, `llmApiKey`, `llmBaseUrl`, `riskMaxPositionSui`, `riskDailyVolumeSui`, `webhookUrl`, `deepbookIndexerUrl`, `deepbookPoolKey`. Keep `openaiApiKey`/`openaiModel` as legacy fallback. |
| `shell-agent/.env.example`              | Document all new keys (follow the commented-default pattern already used for SHELL_PACKAGE_ID).                                                                                                                    |
| NEW `shell-agent/mcp.example.json`      | One http (walrus) + one stdio example.                                                                                                                                                                             |
| NEW `shell-agent/plugins/README.md`     | Worked-example plugin + Tool interface contract + security note.                                                                                                                                                   |
| `shell-agent/package.json`              | Add `@modelcontextprotocol/sdk@^1.29.0`, `@anthropic-ai/sdk`, `@google/genai`, `zod@^3.25.0`, `tsx@^4.20.0` (runtime).                                                                                             |
| `shell-agent/.gitignore`                | Add `mcp.json`, `plugins/*` (with `!plugins/README.md`).                                                                                                                                                           |
| `shell-agent/src/accept-once.ts`        | Untouched — doesn't go through the LLM.                                                                                                                                                                            |

## Build order

Each step lands its own commit so revert is easy if any provider breaks.

1. **Pluggable LLM (no tools yet).** Extract `LlmClient` + factory, move current OpenAI call behind it, keep tool-less single-shot behaviour. Confirm `demo` still passes end-to-end.
2. **Tool registry + 3 cheapest tools.** `get_ref_price`, `get_my_balance`, `get_my_recent_fills`. Wire the tool-use loop. Verify in logs that the LLM actually calls them.
3. **Remaining built-ins.** One at a time so each can be exercised: `get_my_active_orders`, `get_my_active_proposals`, `cancel_order`, `check_risk_cap`, `read_journal`, `append_journal`, `notify_webhook`.
4. **Plugin loader.** Auto-discover `plugins/*.ts`. Ship a trivial echo example in `plugins/README.md`.
5. **MCP client.** Point at `https://sui.furqaannabi.com/mcp` first (known working). Once tool listing + a single tool round-trips, commit `mcp.example.json`.
6. **Anthropic + Google adapters.** Port the OpenAI adapter shape, validate by re-running `demo` against each. OpenAI-compatible mode comes for free via the OpenAI adapter with `baseUrl`.

## Verification

- `npx tsc --noEmit` clean at every step in `shell-agent/`.
- `node dist/index.js demo` completes end-to-end on each step. Once tools land, log diff: each `[demo] ${role} LLM decision` line is preceded by one or more `[tool] ${role} called get_ref_price`-style lines.
- Side-by-side decision quality: same proposal, with vs without tools — `accept_match` still gates correctly, reasoning text now references actual ref price / balance.
- **Plugin smoke:** drop `plugins/echo.ts` returning its input; confirm `plugin__echo` appears in the startup tool-list log and is callable in a demo round.
- **MCP smoke:** with `walrus` registered in `mcp.json`, confirm `mcp__walrus__walrus.get` appears in the tool list the LLM receives (logged on first decision).
- **Provider matrix:** run the same demo against OpenAI, Anthropic, Google, and one OpenAI-compatible endpoint (e.g. Together) to prove the abstraction holds.
- **Risk cap negative test:** set `RISK_MAX_POSITION_SUI=0.05`, run demo with 0.1 SUI proposal → expect `reject_match` citing `check_risk_cap`.
- **Backward-compat:** existing `.env` (only `OPENAI_API_KEY` + `AGENT_POLICY` set, no `LLM_*` keys) still runs `run` mode successfully against gpt-4o-mini.

## Out of scope (follow-up issues, not now)

- Streaming token output — current contract is one-shot final JSON; fine for accept/reject.
- Per-decision token-budget / cost tracking.
- Web UI to edit `mcp.json` or pick provider — config stays file-based for v2.
- Tool-result caching across loop rounds — every call hits live data; fine at 15s tick cadence.
- Persistent journal index — `read_journal` is in-session-only until the rolling-aggregate blob lands.
