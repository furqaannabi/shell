# Shell Finance — Demo Guide

Two ways to demo Shell Finance depending on the audience.

---

## Demo 1 — Browser (visual, recommended for judges)

Shows the full IOI exchange flow with two traders using only a browser.

**Setup**
- Deploy or run `web/` locally (`npm run dev`)
- Two Sui testnet wallets with SUI balance (use two browser profiles or two browsers)
- Enclave running on testnet (teammate's AWS Nitro instance)

**Steps**
1. Profile A: open `/agent`, connect wallet, fill Buy IOI form → click **Post IOI**
2. Profile B: open `/agent`, connect wallet, fill Sell IOI form with overlapping price range → click **Post IOI**
3. Wait up to 15s — enclave polls, decrypts both IOIs, finds overlap, emits `MatchProposed`
4. Both profiles see the match appear in **Match Proposals** feed
5. Each clicks **Accept** → wallet signs → Shell sealed order submitted on-chain
6. Orders appear in the main **Terminal** page as active commitments

**What this shows**
- Privacy: price/size never visible on-chain pre-match
- Enclave as neutral matcher: neither trader sees the other's terms until agreed
- One-click settlement into DeepBook v3

---

## Demo 2 — CLI / AI Execution Agent (headless, power-user story)

Shows an automated trading agent that polls for proposals and uses GPT-4o-mini to decide whether to accept.

**Setup**
```bash
cd shell-agent
npm install
cp .env.example .env
```

Fill `.env`:
```
AGENT_PRIVATE_KEY=<sui private key, suiprivkey1… format>
OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-4o-mini
ENCLAVE_ID=0xe342ee55...
```

**Post a test IOI**
```bash
npm run build
node dist/index.js post-ioi --side buy --size-lo 1 --size-hi 5 --price-lo 1.5 --price-hi 2.5 --ttl 30
```

**Run the agent loop**
```bash
node dist/index.js run
```

Agent will:
1. Poll `MatchProposed` events every 15s
2. Fetch proposal blob from Walrus
3. Ask GPT-4o-mini: accept or reject based on policy
4. If accepted: encrypt Shell order + submit on-chain automatically
5. Append decision entry (reasoning + policy check) to Walrus journal blob
6. Print journal blob ID — paste into **Audit Journal** on `/agent` page to see GPT reasoning

**What this shows**
- Fully autonomous execution: no human in the loop
- LLM policy enforcement: agent rejects proposals outside its mandate
- Verifiable audit trail: every decision stored on Walrus, readable in browser

---

## Recommended demo order

1. Start with **Demo 1** — visual, easy to follow, runs in browser
2. Switch to terminal, show **Demo 2** briefly — "the same flow, fully automated, with AI deciding"
3. Pull up Audit Journal in browser — show GPT reasoning for the accept decision
