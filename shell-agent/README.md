# @shell-finance/shell-agent

Headless LLM-driven trading agent for [Shell Finance](https://github.com/furqaannabi/shell) — a confidential dark pool on Sui: Seal-encrypted intents, AWS Nitro enclave matching, atomic peer-to-peer settlement on-chain, multi-source price discovery (DeepBook / Pyth / fixed NAV).

Fund a wallet, write a policy in plain English, run the agent. It posts encrypted IOIs to Walrus, polls Sui for enclave-generated match proposals, runs an LLM tool-use loop against your policy, and submits Shell orders on-chain — all without human intervention.

- **BYO LLM**: OpenAI, Anthropic, Google, or any OpenAI-compatible endpoint (Ollama, vLLM, OpenRouter, Together, Groq).
- **LLM-driven IOI selection**: each posting window the LLM picks side / size range / price range / TTL from live market data + policy.
- **Built-in trading tools**: ref price (DeepBook / Pyth / fixed NAV), balances, active orders, recent fills, risk caps, IOI history.
- **Extensible**: drop a `.js` / `.mjs` plugin in `plugins/`, or wire any MCP server via `mcp.json`.
- **Multi-pair**: SUI/USDC, RWA pairs (TBILL, USDY), or any custom pair via `AGENT_EXTRA_PAIRS_JSON`.

## Quickstart (recommended — local install)

```bash
mkdir my-agent && cd my-agent
npm init -y
npm install @shell-finance/shell-agent
curl -O https://raw.githubusercontent.com/furqaannabi/shell/main/shell-agent/.env.example
mv .env.example .env
# fill in AGENT_PRIVATE_KEY and your LLM key, then:
npx shell-agent run                                   # live trading loop
```

Why local: agent version pinned in `package.json`, plugins / `mcp.json` colocated with the project, no global PATH issues, multiple projects can run different agent versions side-by-side.

### Global install (alternative)

For ops boxes running a single daemon with no project dir:

```bash
npm install -g @shell-finance/shell-agent
shell-agent run
```

Plugin / MCP discovery is identical either way — both read from `process.cwd()`.

> **Shell is currently testnet-only.** The agent defaults to `AGENT_NETWORK=testnet`. Once a mainnet deploy ships you flip the env to `mainnet`.

## Minimal `.env`

```env
# Required
AGENT_PRIVATE_KEY=suiprivkey1...     # Sui Ed25519 (sui keytool export --key-identity <addr>)
OPENAI_API_KEY=sk-...                # default LLM. Or use LLM_PROVIDER=anthropic|google|openai-compatible

# Network (defaults to testnet)
# AGENT_NETWORK=testnet

# Trading policy — used by the LLM for BOTH IOI posting and match acceptance
AGENT_POLICY=Accumulate 1-3 SUI when DeepBook mid < 1.0 USDC. Max position 10 SUI. Skip posting if spread > 2%. Accept matches priced between 900000 and 1100000.
```

Full env reference, all 9 built-in tools, plugin contract, MCP setup, and worked policy examples live at:

**📖 <https://shell-finance.vercel.app/docs>** (Agent tab)

## Commands

```bash
shell-agent run            # live trading loop — posts IOIs, polls proposals, executes accepts
shell-agent demo           # scripted 2-wallet E2E demo (needs DEMO_BUYER_KEY + DEMO_SELLER_KEY)
shell-agent post-ioi       # post one IOI and exit
```

## Plugins & MCP — extending the agent

The agent is installed as an npm dep, but your custom tools live in **your project root** (cwd where you run `shell-agent`), NOT inside `node_modules`. The CLI reads `./plugins/*` and `./mcp.json` at startup.

```
my-agent/
├── package.json            # { "dependencies": { "@shell-finance/shell-agent": "^0.1.0" } }
├── .env
├── plugins/                # optional — your custom tools
│   └── my_oracle.mjs
├── mcp.json                # optional — MCP server connections
└── node_modules/           # the package lives here, untouched
```

### Custom plugin

Write `.mjs` directly (no build step) or compile `.ts` → `.js`. `.ts` files are skipped with a warning.

```js
// plugins/my_oracle.mjs
import { z } from "zod";

export default {
  name: "my_oracle",
  description: "Custom NAV feed for a private RWA",
  parameters: z.object({ asset: z.string().optional() }),
  async execute({ asset }, ctx) {
    const res = await fetch(`https://my-oracle.example.com/price/${asset ?? "SUI"}`);
    return await res.json();
  },
};
```

Registered as `plugin__my_oracle`. `ctx` exposes `suiClient`, `sealClient`, `keypair`, `address`.

### MCP server

```json
{
  "mcpServers": {
    "walrus": { "transport": "http", "url": "https://sui.furqaannabi.com/mcp" },
    "pyth":   { "transport": "stdio", "command": "npx", "args": ["-y", "pyth-mcp-server"] }
  }
}
```

Tools register as `mcp__walrus__<toolName>`, `mcp__pyth__<toolName>`.

## Decision lifecycle

Each tick the LLM makes two decisions:

1. **IOI posting** — if no IOI is active or current one is expiring soon, the LLM picks terms:
   ```json
   { "skip": false,
     "side": "buy",
     "asset": "0x2::sui::SUI",
     "size_lo": 100000000, "size_hi": 200000000,
     "price_lo": 900000,    "price_hi": 1100000,
     "ttl_min": 60,
     "reasoning": "mid trending up — small buy at slight discount" }
   ```
   Or `{ "skip": true, "reasoning": "spread too wide" }`.

2. **Match acceptance** — when the enclave returns a proposal:
   ```json
   { "decision": "accept_match",
     "reasoning": "agreed_price 1.0 within range, balance sufficient",
     "policy_check": true }
   ```

Both decisions use a bounded tool-use loop (max 6 rounds) so the LLM can call `get_ref_price`, `get_my_balance`, `check_risk_cap`, `get_my_recent_iois`, etc. before committing.

## Companion package

This agent uses [`@shell-finance/sdk`](https://www.npmjs.com/package/@shell-finance/sdk) for Seal encryption + PTB construction. If you only want to build sealed orders directly (not run a daemon), depend on the SDK instead.

## License

MIT — see [LICENSE](./LICENSE).
