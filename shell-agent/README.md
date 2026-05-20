# shell-agent

Autonomous trading bot for Shell Finance. Fund a wallet, set a policy, run the agent — it posts IOIs, evaluates match proposals with GPT-4o-mini, and submits Shell sealed orders on-chain without human intervention.

---

## Deployment model

Shell Finance has two interfaces — pick the one that fits:

| | **Web UI** | **shell-agent CLI** |
|---|---|---|
| Who | Regular traders | Quants, bot operators |
| How | Connect Slush wallet, use browser | Clone repo, fill `.env`, run on machine/VPS |
| Decisions | Human clicks Accept | GPT enforces policy automatically |
| Key custody | Wallet extension (user controls) | Private key in `.env` (self-hosted, nobody else touches it) |
| Runs | When browser is open | 24/7 on any Node 20 server |

**The CLI is self-hosted by design.** Quants never hand their private key to a third party — same model as every algo trading bot on Binance, dYdX, or any other exchange. You clone, configure, deploy on your own infrastructure.

Regular users never need to touch the CLI. It is an optional power-user path.

---

## Who this is for

- **Quants** who want policy-driven automated execution without a custodian
- **Bot operators** running 24/7 strategies on Sui testnet
- **Hackathon judges** who want to see the AI execution layer in action

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
│  3. EVALUATE with GPT-4o-mini                           │
│     "Does this match satisfy my policy?"                │
│     decision: accept_match / reject_match / wait        │
│                                                         │
│  4. EXECUTE (if accepted + policy_check = true)         │
│     Seal-encrypt Shell order → sign TX → submit         │
│     Collateral split: buy → DUSDC, sell → SUI           │
│                                                         │
│  5. LOG to Walrus (every event, every decision)         │
└─────────────────────────────────────────────────────────┘
```

**Privacy guarantees (from Shell Finance):**
- IOI price/size encrypted under Seal before leaving the machine
- Only the attested Nautilus enclave can decrypt
- Counterparty never sees your original price range, even after match

---

## Setup

### 1. Install

```bash
cd shell-agent
npm install
cp .env.example .env
```

### 2. Create a funded Sui testnet wallet

Generate a new keypair (keep the `suiprivkey1…` output):

```bash
# Using Sui CLI
sui client new-address ed25519

# Or any Sui wallet — export the private key in bech32 format (suiprivkey1…)
```

Fund it:
- SUI for gas + sell-side collateral → from [faucet.testnet.sui.io](https://faucet.testnet.sui.io)
- DUSDC for buy-side collateral → get from testnet DUSDC faucet

### 3. Configure `.env`

```bash
# Required
AGENT_PRIVATE_KEY=suiprivkey1...    # bech32 secret key
OPENAI_API_KEY=sk-...               # GPT-4o-mini access

# Your trading policy (plain English — GPT enforces this)
AGENT_POLICY=Accept matches priced between 1.90 and 2.10 DUSDC. Reject if size exceeds 5 SUI. Reject if price deviates more than 5% from 2.00.

# IOI terms (1e9-scaled integers)
# 1 SUI = 1000000000  |  1.80 DUSDC = 1800000000
AGENT_IOI_SIDE=buy
AGENT_IOI_SIZE_LO=1000000000      # min 1 SUI
AGENT_IOI_SIZE_HI=10000000000     # max 10 SUI
AGENT_IOI_PRICE_LO=1800000000     # min 1.80 DUSDC
AGENT_IOI_PRICE_HI=2200000000     # max 2.20 DUSDC
AGENT_IOI_TTL_MIN=60              # re-post IOI every 60 min
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

Starts the agent. On every 15s tick:

1. **Auto-post IOI** if none active or expiring within 60s
   - Encrypts plaintext under Shell Seal identity
   - Uploads to Walrus (2 epochs)
   - Calls `shell::ioi::record_ioi` on-chain

2. **Poll** `shell::ioi::MatchProposed` events for this wallet address

3. **Evaluate** each new proposal with GPT:
   ```
   System: "You are a trading agent. Your policy is: {AGENT_POLICY}"
   User:   "Match proposal: price=X size=Y side=buy. Decide."
   ```
   Returns `{ decision, reasoning, policy_check }`

4. **Execute** if `decision === "accept_match"` AND `policy_check === true`:
   - Encrypts Shell sealed order with proposal terms
   - Splits collateral from wallet (DUSDC for buy, SUI for sell)
   - Signs and submits transaction

5. **Log** every event to Walrus (proposal received, decision, order submitted)
   - Prints journal `blob_id` — paste into IOI Desk → Audit Journal tab in the web UI

---

### `post-ioi` — one-shot IOI

```bash
node dist/index.js post-ioi \
  --side buy \
  --size-lo 1000000000 \
  --size-hi 5000000000 \
  --price-lo 1900000000 \
  --price-hi 2100000000 \
  --ttl-ms 1800000
```

Posts a single IOI and exits. Useful for testing or manually seeding a position before starting `run`.

---

### `demo` — full end-to-end demo (two wallets)

```bash
# Add to .env:
DEMO_BUYER_KEY=suiprivkey1...   # funded wallet A
DEMO_SELLER_KEY=suiprivkey1...  # funded wallet B

node dist/index.js demo
```

Runs a three-step scripted demo:

**Step 1 — AI policy enforcement**
Sends a synthetic bad proposal (price 3.50 DUSDC, above policy max) to GPT. Shows `reject_match` with reasoning. No on-chain action.

**Step 2 — Post IOIs**
Both wallets post overlapping IOIs simultaneously:
- Buyer: 2–4 SUI @ 1.80–2.20 DUSDC
- Seller: 2–4 SUI @ 1.90–2.10 DUSDC

**Step 3 — Enclave matches, AI accepts**
Polls every 5s (5 min timeout). When the enclave emits `MatchProposed`:
- GPT evaluates the real proposal against the demo policy
- Prints full reasoning
- Submits Shell orders for both sides

---

## Policy writing guide

`AGENT_POLICY` is a free-text string passed as GPT's system prompt. Write it like a compliance rule:

```
# Conservative (tight range, small size)
Accept if agreed_price is between 1900000000 and 2100000000 AND agreed_size <= 3000000000. Reject all others.

# Aggressive (wide range)
Accept any match where agreed_price is above 1500000000. Reject if agreed_size exceeds 20000000000.

# Multi-condition
Accept if price is within 5% of 2000000000 (i.e. between 1900000000 and 2100000000).
Reject if size exceeds 5000000000 (5 SUI). Wait if market conditions are unclear.
```

**Important:** prices and sizes are 1e9-scaled integers. 1 SUI = `1000000000`. 1.80 DUSDC = `1800000000`. Include this note in your policy so GPT interprets the numbers correctly.

GPT returns `policy_check: true` only if it can prove the decision follows the policy. The agent skips execution if `policy_check` is false even when `decision` is `accept_match`.

---

## Audit trail

Every event is appended as a JSON-Lines blob to Walrus:

```json
{"timestamp_ms":1716200000000,"agent_id":"0xabc...","event":"decision","decision":{"decision":"accept_match","reasoning":"Price 2.00 DUSDC is within policy range 1.90–2.10. Size 2 SUI is under limit 5 SUI.","policy_check":true}}
```

The agent prints each `blob_id` to stdout. Paste it into **IOI Desk → Audit Journal** in the web UI to view the full decision log.

---

## Architecture

```
shell-agent/
  src/
    index.ts      CLI entry — routes run / demo / post-ioi
    config.ts     Env var loader with defaults
    agent.ts      Main loop — auto-post IOI + poll + evaluate + execute
    ioi.ts        Seal-encrypt IOI → Walrus → on-chain record_ioi
    proposals.ts  Poll MatchProposed events → fetch + BCS-decode blobs
    llm.ts        OpenAI chat.completions → structured LlmDecision
    orders.ts     Build + sign Shell sealed order from proposal terms
    walrus.ts     PUT / GET blobs to Walrus testnet
    journal.ts    Append JSON-Lines entries to Walrus
    demo.ts       Scripted two-wallet E2E demo
```

### Key dependencies

| Package | Version | Purpose |
|---|---|---|
| `@mysten/sui` | 2.16.2 | Sui RPC, keypairs, transactions |
| `@mysten/seal` | 1.1.3 | Threshold IBE encryption |
| `@mysten/bcs` | 2.0.5 | Binary serialization (matches enclave + web) |
| `@shell-finance/sdk` | local | `encryptOrder`, `submitOrderTx` |
| `openai` | ^4.77.0 | GPT-4o-mini decisions |

---

## Running on a VPS (24/7)

Any Linux VPS with Node 20 works. Recommended: keep it running with `pm2`.

```bash
# Install pm2 globally
npm install -g pm2

# Build first
npm run build

# Start the agent as a managed process
pm2 start dist/index.js --name shell-agent -- run

# Auto-restart on reboot
pm2 save
pm2 startup

# Useful commands
pm2 logs shell-agent        # tail live logs
pm2 status                  # check running/stopped
pm2 stop shell-agent        # stop
pm2 restart shell-agent     # restart after config change
```

Or use `screen` if you prefer:

```bash
screen -S shell-agent
node dist/index.js run
# Ctrl+A then D to detach
# screen -r shell-agent to re-attach
```

---

## Getting your private key

**From Sui CLI (generated with `sui client new-address`):**

```bash
# List all addresses
sui client addresses

# Export the key — outputs suiprivkey1... bech32 format
sui keytool export --key-identity <ADDRESS>
```

**From Slush / other wallets:**
Slush does not expose private keys. Create a dedicated agent wallet using Sui CLI instead — never use your main wallet.

**Check balance before running:**

```bash
sui client balance --address <YOUR_ADDRESS>
```

Need both SUI (gas + sell collateral) and DUSDC (buy collateral). Get testnet SUI from [faucet.testnet.sui.io](https://faucet.testnet.sui.io).

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `missing env var: AGENT_PRIVATE_KEY` | `.env` not filled | Set `AGENT_PRIVATE_KEY=suiprivkey1...` |
| `record_ioi failed: function not found` | Move package not upgraded | Teammate must run `sui client upgrade` |
| `no DUSDC coin to use` | Wallet has no DUSDC | Get DUSDC from testnet faucet, or switch `AGENT_IOI_SIDE=sell` |
| `walrus put 429` | Walrus rate limit | Increase `AGENT_IOI_TTL_MIN` to reduce re-post frequency |
| `LLM returned non-JSON` | GPT hallucinated | Retry; if recurring, simplify `AGENT_POLICY` |
| `timeout — enclave did not match` | Enclave down or no counterparty | Check enclave status with teammate; verify a counterparty IOI exists |

---

## Prerequisites

- Move package upgraded to include `shell::ioi` module (teammate runs `sui client upgrade`)
- Nautilus enclave running on testnet (teammate's AWS instance)
- Node.js >= 20
- Funded testnet wallet (SUI + DUSDC)
