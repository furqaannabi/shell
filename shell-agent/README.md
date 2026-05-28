# shell-agent

Autonomous trading bot for Shell Finance. Fund a wallet, set a policy, run the agent — it posts IOIs, evaluates match proposals with an LLM (your choice of provider), and submits Shell sealed orders on-chain without human intervention.

---

## Deployment model

Shell Finance has two interfaces — pick the one that fits:

| | **Web UI** | **shell-agent CLI** |
|---|---|---|
| Who | Regular traders | Quants, bot operators |
| How | Connect Slush wallet, use browser | Clone repo, fill `.env`, run on machine/VPS |
| Decisions | Human clicks Accept | LLM enforces policy automatically |
| Key custody | Wallet extension (user controls) | Private key in `.env` (self-hosted, nobody else touches it) |
| Runs | When browser is open | 24/7 on any Node 20 server |

**The CLI is self-hosted by design.** Quants never hand their private key to a third party — same model as every algo trading bot on Binance, dYdX, or any other exchange.

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│                    shell-agent run                       │
│                                                         │
│  Every 15 seconds:                                      │
│                                                         │
│  1. POST IOI (if none active or expiring soon)          │
│     plaintext → Seal encrypt → Walrus upload → on-chain │
│                                                         │
│  2. POLL MatchProposed events on Sui                    │
│     enclave matched your IOI with a counterparty        │
│                                                         │
│  3. EVALUATE with LLM (tool-use loop, up to 6 rounds)   │
│     LLM calls built-in tools to check market data,      │
│     balance, risk caps, and recent fills before         │
│     returning: accept_match / reject_match / wait       │
│                                                         │
│  4. EXECUTE (if accepted + policy_check = true)         │
│     Seal-encrypt Shell order → sign TX → submit         │
│     Collateral split: buy → USDC, sell → SUI            │
│                                                         │
│  5. LOG to Walrus (every event, every decision)         │
└─────────────────────────────────────────────────────────┘
```

**Privacy guarantees (from Shell Finance):**
- IOI price/size encrypted under Seal before leaving the machine
- Only the attested Nautilus enclave can decrypt
- Counterparty never sees your original price range, even after match

---

## Role of the enclave

shell-agent never calls the enclave directly. All coordination happens through Sui events.

```
shell-agent                   Sui chain              Nautilus enclave
    │                             │                        │
    │── postIoi() ──────────────► IoisPosted event ──────► │ decrypt IOI
    │                             │                        │ compare all IOIs
    │                             │                        │ find overlap
    │                             │ ◄── MatchProposed ──── │ emit event
    │ ◄── pollProposals() ────────│                        │
    │  fetch blob from Walrus     │                        │
    │  LLM evaluates (+ tools)    │                        │
    │── submitOrder() ──────────► OrderCommitment event ──► │ decrypt order
    │                             │                        │ settle_direct
```

---

## Setup

### 1. Install

```bash
cd shell-agent
npm install
cp .env.example .env
```

### 2. Create a funded Sui testnet wallet

```bash
sui client new-address ed25519
# Outputs: suiprivkey1… bech32 key — put this in AGENT_PRIVATE_KEY
```

Fund it:
- SUI for gas + sell-side collateral → [faucet.testnet.sui.io](https://faucet.testnet.sui.io)
- USDC for buy-side collateral → testnet USDC faucet

### 3. Configure `.env`

**Default LLM is OpenAI.** Set `OPENAI_API_KEY` and nothing else — the agent defaults to `gpt-4o-mini` automatically. No `LLM_PROVIDER` needed unless switching to a different provider.

```bash
# Minimum viable .env (OpenAI default)
AGENT_PRIVATE_KEY=suiprivkey1...
OPENAI_API_KEY=sk-...
AGENT_POLICY=Accept matches priced between 900000 and 1100000 AND size between 100000000 and 200000000. Call check_risk_cap first.
```

To switch provider, add `LLM_PROVIDER` + `LLM_MODEL` + `LLM_API_KEY` (see `.env.example` for all provider blocks). `LLM_API_KEY` overrides `OPENAI_API_KEY` when set.

Full IOI parameters (optional — these are the defaults):

```bash
AGENT_IOI_SIDE=buy
AGENT_IOI_SIZE_LO=1000000000    # 1 SUI    (1e9-scaled)
AGENT_IOI_SIZE_HI=10000000000   # 10 SUI
AGENT_IOI_PRICE_LO=1800000      # 1.80 USDC (1e6-scaled)
AGENT_IOI_PRICE_HI=2200000      # 2.20 USDC
AGENT_IOI_TTL_MIN=60
```

### 4. Run

```bash
npm run build
node dist/index.js run
```

---

## Commands

### `run` — autonomous trading loop

```bash
node dist/index.js run
```

On every tick (default 15s, configurable via `AGENT_POLL_INTERVAL_SEC`) the agent:

1. **Auto-posts IOI** if none active or expiring within 60s
2. **Polls** `MatchProposed` events for this wallet
3. **Evaluates** each new proposal using the LLM tool-use loop (see below)
4. **Executes** if `decision === "accept_match"` AND `policy_check === true`
5. **Logs** every event to Walrus

---

### `demo` — full end-to-end demo (two wallets)

```bash
# Add to .env:
DEMO_BUYER_KEY=suiprivkey1...
DEMO_SELLER_KEY=suiprivkey1...

node dist/index.js demo
```

Scripted five-step demo:

| Step | What happens |
|---|---|
| 0 | Pre-flight balance check |
| 1 | AI rejects a synthetic bad proposal (price out of range) |
| 2 | Both wallets post overlapping encrypted IOIs on-chain |
| 3 | Enclave matches → LLM evaluates with tools → orders submitted |
| 4 | Wait for enclave to settle |
| 5 | Post-settlement balance check (balances swap correctly) |

---

### `post-ioi` — one-shot IOI

```bash
node dist/index.js post-ioi \
  --side buy \
  --size-lo 1000000000 \
  --size-hi 10000000000 \
  --price-lo 1800000 \
  --price-hi 2200000 \
  --ttl-ms 1800000
```

Posts a single IOI and exits. Useful for testing or seeding a position.

---

## LLM tool-use loop

Before accepting or rejecting a proposal, the LLM runs a **bounded tool-use loop** (max 6 rounds). It can call any registered tool to gather data, then return a final decision.

### Built-in tools

| Tool | What it does |
|---|---|
| `get_ref_price` | DeepBook SUI/USDC bid/ask/mid (live market data) |
| `get_my_balance` | Agent's SUI + USDC balance |
| `get_my_recent_fills` | Last N SettlementReceipts (own fills) |
| `get_my_active_orders` | Live OrderCommitments with collateral locked |
| `get_my_active_proposals` | Recent MatchProposed events for this agent |
| `cancel_order` | Cancel an expired OrderCommitment and reclaim collateral |
| `check_risk_cap` | Net position + daily volume vs `RISK_MAX_POSITION_SUI` / `RISK_DAILY_VOLUME_SUI` |
| `append_journal` | Write a note to the agent's Walrus journal |
| `notify_webhook` | POST a JSON event to `WEBHOOK_URL` if set |

### Risk caps (optional)

```bash
RISK_MAX_POSITION_SUI=5.0      # refuse trades that push net position above 5 SUI
RISK_DAILY_VOLUME_SUI=20.0     # refuse trades that push daily volume above 20 SUI
```

Set these and add `check_risk_cap` guidance to `AGENT_POLICY`. Leave at `0` to disable.

---

## Pluggable LLM providers

**Default: OpenAI + `gpt-4o-mini`.** Set `OPENAI_API_KEY` and the agent works with no other LLM config.

| `LLM_PROVIDER` | Example `LLM_MODEL` | How to activate |
|---|---|---|
| `openai` **(default)** | `gpt-4o-mini`, `gpt-4o` | Set `OPENAI_API_KEY` — no `LLM_PROVIDER` needed |
| `anthropic` | `claude-haiku-4-5-20251001`, `claude-sonnet-4-6` | `LLM_PROVIDER=anthropic` + `LLM_API_KEY=sk-ant-...` |
| `google` | `gemini-2.0-flash`, `gemini-2.5-pro` | `LLM_PROVIDER=google` + `LLM_API_KEY=AIza...` |
| `openai-compatible` | any model the endpoint accepts | `LLM_PROVIDER=openai-compatible` + `LLM_BASE_URL=...` |

OpenAI-compatible works with Ollama (local), vLLM, OpenRouter, Together, Groq — any provider with an OpenAI-shaped API. Some need no key (`LLM_API_KEY=` blank).

---

## Extending the agent

### Local plugins

Drop `.js` or `.mjs` files into `plugins/` (gitignored). Each is auto-loaded at startup and registered as `plugin__<name>`. TypeScript plugins must be compiled to `.js` first — Node.js ESM can't import raw `.ts` files.

```js
// plugins/my_oracle.mjs
import { z } from "zod";

const myOracle = {
  name: "my_oracle",
  description: "Returns my proprietary SUI/USDC fair value.",
  parameters: z.object({}),
  async execute() {
    const res = await fetch("https://my-oracle.example.com/sui-usdc");
    return await res.json();
  },
};
export default myOracle;
```

See `plugins/README.md` for the full `ToolCtx` interface (suiClient, sealClient, keypair, address). `plugins/sample.mjs` is a working two-tool example.

### MCP servers

Copy `mcp.example.json` to `mcp.json` and add any MCP server:

```json
{
  "mcpServers": {
    "walrus": {
      "transport": "http",
      "url": "https://sui.furqaannabi.com/mcp"
    },
    "my-feed": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "my-mcp-server"]
    }
  }
}
```

Every tool from every server is registered as `mcp__<server>__<tool>` and available to the LLM automatically. Both stdio and HTTP (StreamableHTTP) transports supported.

---

## Policy writing guide

`AGENT_POLICY` is free-text passed as the LLM's system instruction. Write it like a compliance rule.

**Price scale: 1e6 (USDC).** 1.00 USDC = `1_000_000`. 0.90 USDC = `900_000`.  
**Size scale: 1e9 (SUI).** 0.1 SUI = `100_000_000`. 1 SUI = `1_000_000_000`.

```
# Tight range
Accept only if agreed_price is between 900000 and 1100000 (0.90–1.10 USDC)
AND agreed_size is between 100000000 and 200000000 (0.1–0.2 SUI).
Reject all others. Call check_risk_cap before accepting.

# Reference-price anchored
Call get_ref_price first. Accept only if agreed_price is within 2% of mid.
Reject if agreed_size exceeds 500000000 (0.5 SUI).

# Aggressive buy-side
Accept any buy match where agreed_price is below 1050000 (1.05 USDC).
Reject if balance check shows less than 5 USDC available.
```

The LLM returns `policy_check: true` only if it can prove the decision follows the policy. The agent skips execution if `policy_check` is false even when `decision` is `accept_match`.

---

## Audit trail

Every event is appended as a JSON-Lines blob to Walrus:

```json
{"timestamp_ms":1716200000000,"agent_id":"0xabc...","event":"decision","decision":{"decision":"accept_match","reasoning":"Price 1000000 USDC is within range 900000–1100000. Balance sufficient.","policy_check":true}}
```

The agent prints each `blob_id` to stdout. Paste it into **IOI Desk → Audit Journal** in the web UI to view the decision log.

---

## Architecture

```
shell-agent/
  src/
    index.ts           CLI entry — routes run / demo / post-ioi
    config.ts          Env var loader with defaults
    agent.ts           Main loop — auto-post IOI + poll + evaluate + execute
    ioi.ts             Seal-encrypt IOI → Walrus → on-chain record_ioi
    proposals.ts       Poll MatchProposed events → fetch + BCS-decode blobs
    orders.ts          Build + sign Shell sealed order from proposal terms
    walrus.ts          PUT / GET blobs to Walrus testnet
    journal.ts         Append JSON-Lines entries to Walrus
    demo.ts            Scripted two-wallet E2E demo
    llm/
      index.ts         LlmClient interface + factory (dispatches on LLM_PROVIDER)
      openai.ts        OpenAI adapter (also used for openai-compatible)
      anthropic.ts     Anthropic Claude adapter
      google.ts        Google Gemini adapter
      loop.ts          Bounded tool-use loop (max 6 rounds)
      prompt.ts        System prompt + user message builders
    tools/
      registry.ts      ToolRegistry — register, list, execute by name
      builtin.ts       9 built-in tools (ref price, balance, fills, risk, etc.)
      plugins.ts       Auto-load plugins/*.{ts,js} at startup
      mcp.ts           MCP client loader — connects servers from mcp.json
  plugins/             User plugins (gitignored; README.md checked in)
  mcp.example.json     MCP config template
```

### Key dependencies

| Package | Purpose |
|---|---|
| `@mysten/sui` | Sui RPC, keypairs, transactions |
| `@mysten/seal` | Threshold IBE encryption |
| `@mysten/bcs` | Binary serialization (matches enclave + web) |
| `@shell-finance/sdk` | `encryptOrder`, `submitOrderTx`, `getActiveOrders`, `getReceipts` |
| `openai` | OpenAI + openai-compatible adapter |
| `@anthropic-ai/sdk` | Anthropic Claude adapter |
| `@google/genai` | Google Gemini adapter |
| `@modelcontextprotocol/sdk` | MCP client (stdio + HTTP transports) |
| `zod` | Tool parameter schemas + validation |

---

## Running on a VPS (24/7)

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name shell-agent -- run
pm2 save && pm2 startup

pm2 logs shell-agent      # tail live logs
pm2 restart shell-agent   # restart after config change
```

---

## Getting your private key

```bash
# List addresses
sui client addresses

# Export bech32 key (suiprivkey1…)
sui keytool export --key-identity <ADDRESS>
```

Slush does not expose private keys. Use a dedicated agent wallet created with the Sui CLI — never use your main wallet.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `AGENT_PRIVATE_KEY is required` | `.env` not filled | Set `AGENT_PRIVATE_KEY=suiprivkey1...` |
| `no LLM API key` | Neither `LLM_API_KEY` nor `OPENAI_API_KEY` set | Add the appropriate key |
| `unknown LLM_PROVIDER=X` | Typo in provider name | Valid values: `openai`, `anthropic`, `google`, `openai-compatible` |
| `record_ioi failed: function not found` | Move package not upgraded | Teammate runs `sui client upgrade` |
| `no USDC coin to use` | Wallet has no USDC | Get USDC from testnet faucet, or switch `AGENT_IOI_SIDE=sell` |
| `walrus put 429` | Rate limit | Increase `AGENT_IOI_TTL_MIN` |
| `LLM returned non-JSON` | Model hallucinated | Retry; if recurring, simplify `AGENT_POLICY` |
| `timeout — enclave did not match` | Enclave down or no counterparty | Check enclave status; verify counterparty IOI exists |

---

## Prerequisites

- Move package upgraded to include `shell::ioi` module
- Nautilus enclave running on testnet
- Node.js >= 20
- Funded testnet wallet (SUI + USDC)
