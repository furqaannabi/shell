'use client';

import { useState } from 'react';

type Tab = 'agent' | 'sdk';
type AgentSection = 'quickstart' | 'env' | 'tools' | 'plugins' | 'mcp' | 'policy';

function SectionHeader({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider mb-3 mt-8 first:mt-0 flex items-center gap-2">
      <span className="w-1 h-4 bg-primary/60 rounded-full inline-block" />
      {children}
    </h3>
  );
}

function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="relative mb-4 group/code">
      <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
        {lang && (
          <span className="font-mono-sm text-[10px] text-on-surface-variant/30 select-none">{lang}</span>
        )}
        <button
          onClick={copy}
          className="opacity-0 group-hover/code:opacity-100 transition-opacity flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/50 font-mono-sm text-[10px] text-on-surface-variant hover:text-primary hover:border-primary/40 cursor-pointer"
          title="Copy to clipboard"
        >
          <span className="material-symbols-outlined text-[12px]">
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-[#0D1117] border border-outline-variant/50 rounded p-4 pt-8 font-mono-data text-[12px] text-on-surface overflow-x-auto leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-secondary/20 bg-secondary/5 rounded p-3 mb-4 font-mono-sm text-[11px] text-on-surface-variant">
      <span className="text-secondary font-medium">NOTE  </span>{children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-yellow-500/20 bg-yellow-500/5 rounded p-3 mb-4 font-mono-sm text-[11px] text-on-surface-variant">
      <span className="text-yellow-400 font-medium">WARN  </span>{children}
    </div>
  );
}

function FnCard({ name, sig, desc, params }: {
  name: string;
  sig: string;
  desc: string;
  params?: { name: string; type: string; desc: string; optional?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copySig() {
    navigator.clipboard.writeText(sig).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="border border-outline-variant/40 rounded mb-3 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-container-high/30 hover:bg-surface-container-high/60 transition-colors cursor-pointer text-left"
      >
        <span className="font-mono-data text-[13px] text-primary">{name}</span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-outline-variant/30">
          <p className="font-mono-sm text-[11px] text-on-surface-variant mb-3">{desc}</p>
          {params && params.length > 0 && (
            <div className="mb-3">
              <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-1.5">Parameters</div>
              <table className="w-full text-left font-mono-sm text-[11px]">
                <tbody>
                  {params.map(p => (
                    <tr key={p.name} className="border-b border-outline-variant/20 last:border-0">
                      <td className="py-1.5 pr-4 text-secondary whitespace-nowrap">
                        {p.name}{p.optional ? <span className="text-on-surface-variant opacity-50">?</span> : ''}
                      </td>
                      <td className="py-1.5 pr-4 text-on-surface-variant/60 whitespace-nowrap">{p.type}</td>
                      <td className="py-1.5 text-on-surface-variant">{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Signature</span>
            <button
              onClick={copySig}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/50 font-mono-sm text-[10px] text-on-surface-variant hover:text-primary hover:border-primary/40 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="bg-[#0D1117] rounded p-3 font-mono-data text-[11px] text-on-surface overflow-x-auto">
            <code>{sig}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

const BUILTIN_TOOLS = [
  {
    name: 'get_ref_price',
    desc: 'Returns DeepBook mid, bid, ask for SUI/USDC in USDC. Call before evaluating a proposal price. Returns { error } if indexer is down.',
    params: [],
    returns: '{ bid: number, ask: number, mid: number }',
    sig: 'get_ref_price() => { bid, ask, mid }',
  },
  {
    name: 'get_my_balance',
    desc: "Returns the agent's own SUI + USDC balance. Raw u64 strings at native scale plus human-readable floats.",
    params: [],
    returns: '{ sui_raw, usdc_raw, sui, usdc }',
    sig: 'get_my_balance() => { sui_raw: string, usdc_raw: string, sui: number, usdc: number }',
  },
  {
    name: 'get_my_recent_fills',
    desc: 'Returns last N SettlementReceipts owned by agent, newest first.',
    params: [{ name: 'limit', type: 'number', desc: 'Max results 1–50 (default 10)', optional: true }],
    returns: '{ object_id, counterparty, filled_size, filled_price }[]',
    sig: `get_my_recent_fills({ limit?: number })
  => Array<{ object_id, counterparty, filled_size, filled_price }>`,
  },
  {
    name: 'get_my_active_orders',
    desc: 'Returns live OrderCommitment objects (collateral locked, not yet expired). Empty array if none.',
    params: [{ name: 'limit', type: 'number', desc: 'Max results 1–50 (default 20)', optional: true }],
    returns: '{ order_id, collateral_type, expiry_epoch, submitted_at_ms }[]',
    sig: `get_my_active_orders({ limit?: number })
  => Array<{ order_id, collateral_type, expiry_epoch, submitted_at_ms }>`,
  },
  {
    name: 'get_my_active_proposals',
    desc: 'Returns MatchProposed events where this agent is buy or sell side, not yet expired. Useful to detect if already matched before accepting.',
    params: [],
    returns: '{ side, agreed_price, agreed_size, expiry_ms, blob_id }[]',
    sig: `get_my_active_proposals()
  => Array<{ side, agreed_price, agreed_size, expiry_ms, blob_id }>`,
  },
  {
    name: 'cancel_order',
    desc: 'Cancels an expired OrderCommitment and returns collateral to the agent. Shell has no pre-expiry cancel by design — the chain aborts with EOrderNotExpired if called too early.',
    params: [
      { name: 'order_id', type: 'string', desc: 'ObjectId from get_my_active_orders' },
      { name: 'collateral_type', type: 'string', desc: 'Move coin type from the same order row' },
    ],
    returns: '{ digest: string }',
    sig: `cancel_order({ order_id: string, collateral_type: string })
  => { digest: string }`,
  },
  {
    name: 'check_risk_cap',
    desc: 'Aggregates fills + open orders vs RISK_MAX_POSITION_SUI / RISK_DAILY_VOLUME_SUI env caps. within_cap=true means accepting the proposal stays within limits. Caps of 0 disable enforcement.',
    params: [
      { name: 'proposed_size_sui', type: 'number', desc: 'agreed_size / 1e9. Pass 0 if unknown.', optional: true },
    ],
    returns: '{ within_cap, current_position_sui, daily_volume_sui, breach_position, breach_daily, ... }',
    sig: `check_risk_cap({ proposed_size_sui?: number })
  => {
    within_cap: boolean,
    current_position_sui: number,
    daily_volume_sui: number,
    proposed_size_sui: number,
    cap_position_sui: number,
    cap_daily_sui: number,
    breach_position: boolean,
    breach_daily: boolean,
  }`,
  },
  {
    name: 'append_journal',
    desc: 'Appends a text note to the agent Walrus journal blob. Each call writes a blob — use sparingly.',
    params: [
      { name: 'note', type: 'string', desc: 'Text to record (max 2000 chars)', optional: true },
    ],
    returns: '{ blob_id: string }',
    sig: `append_journal({ note?: string }) => { blob_id: string }`,
  },
  {
    name: 'notify_webhook',
    desc: 'POSTs JSON { event, data, ts } to WEBHOOK_URL env. No-op and returns sent:false if unset.',
    params: [
      { name: 'event', type: 'string', desc: 'Event name (e.g. "accept_match")' },
      { name: 'data', type: 'Record<string, unknown>', desc: 'Arbitrary JSON payload', optional: true },
    ],
    returns: '{ sent: boolean, status?: number, reason?: string }',
    sig: `notify_webhook({ event: string, data?: Record<string, unknown> })
  => { sent: boolean, status?: number, reason?: string }`,
  },
];

function AgentTab() {
  const [section, setSection] = useState<AgentSection>('quickstart');

  const sections: { id: AgentSection; label: string }[] = [
    { id: 'quickstart', label: 'Quickstart' },
    { id: 'env', label: 'Config / Env' },
    { id: 'tools', label: 'Built-in Tools' },
    { id: 'plugins', label: 'Custom Plugins' },
    { id: 'mcp', label: 'MCP Integration' },
    { id: 'policy', label: 'Agent Policy' },
  ];

  return (
    <div className="flex gap-8 h-full min-h-0">
      {/* Section nav — fixed, does not scroll */}
      <div className="hidden lg:flex flex-col gap-0.5 w-40 flex-shrink-0 pt-1">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`text-left px-3 py-1.5 rounded font-mono-sm text-[11px] transition-colors cursor-pointer ${
              section === s.id
                ? 'bg-primary/10 text-primary border-l-2 border-primary pl-2.5'
                : 'text-on-surface-variant hover:text-on-surface border-l-2 border-transparent pl-2.5'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content — scrolls independently */}
      <div className="flex-1 min-w-0 overflow-y-auto pb-6">
        {/* Mobile section select */}
        <select
          className="lg:hidden w-full mb-6 rounded p-2 bg-surface-container-high border border-outline-variant text-on-surface font-mono-sm text-mono-sm focus:outline-none"
          value={section}
          onChange={e => setSection(e.target.value as AgentSection)}
        >
          {sections.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        {section === 'quickstart' && (
          <>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-6">
              <span className="text-primary">shell-agent</span> is an autonomous trading daemon for Shell Finance.
              It posts encrypted IOIs to Walrus, polls the Sui chain for enclave-generated match proposals,
              and uses an LLM — with live on-chain tools — to decide whether to accept, reject, or wait on each match.
              When it accepts, it builds and submits the sealed order transaction without any human intervention.
            </p>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-6">
              The agent is designed for quants running systematic strategies or market makers who want to operate
              in the dark pool programmatically. Bring your own LLM key (OpenAI, Anthropic, Google, or any
              OpenAI-compatible endpoint including local Ollama). Write your trading policy in plain English —
              the LLM will call tools like <span className="text-primary">get_ref_price</span> and{' '}
              <span className="text-primary">check_risk_cap</span> to verify compliance before deciding.
            </p>
            <SectionHeader>Install</SectionHeader>
            <CodeBlock lang="sh">{`npm install -g @shell-finance/shell-agent`}</CodeBlock>

            <SectionHeader>Run commands</SectionHeader>
            <CodeBlock lang="sh">{`shell-agent run          # live trading loop — posts IOIs, polls proposals, LLM decides
shell-agent demo         # dry-run: two synthetic agents trade against each other
shell-agent post-ioi     # post one IOI and exit`}</CodeBlock>

            <SectionHeader>Minimal .env</SectionHeader>
            <CodeBlock lang="env">{`# Required
AGENT_PRIVATE_KEY=suiprivkey1...    # Sui Ed25519 keypair (sui keytool export)

# LLM — pick one
OPENAI_API_KEY=sk-...               # shortcut: defaults to openai + gpt-4o-mini
# or
LLM_PROVIDER=anthropic              # openai | anthropic | google | openai-compatible
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-...

# Trading policy — free-text enforced by the LLM on every match proposal
# Prices: 1e6-scaled USDC (1.00 USDC = 1_000_000)  Sizes: 1e9-scaled SUI (1 SUI = 1_000_000_000)
AGENT_POLICY=Accept matches priced between 900000 and 1100000 AND size between 100000000 and 1000000000. Call check_risk_cap first.`}</CodeBlock>

            <SectionHeader>Decision lifecycle</SectionHeader>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-3">
              For each MatchProposal the agent receives, the LLM goes through a bounded tool-use loop (max 6 rounds), then produces a final JSON verdict:
            </p>
            <CodeBlock lang="json">{`{
  "decision": "accept_match" | "reject_match" | "wait",
  "reasoning": "string explaining why",
  "policy_check": true  // true only if policy provably satisfied via tool checks
}`}</CodeBlock>
          </>
        )}

        {section === 'env' && (
          <>
            <SectionHeader>Required</SectionHeader>
            <CodeBlock lang="env">{`# Sui wallet keypair (bech32). Generate: sui client new-address ed25519
# Export: sui keytool export --key-identity <ADDRESS>
# Not used by \`demo\` (demo uses DEMO_BUYER_KEY / DEMO_SELLER_KEY)
AGENT_PRIVATE_KEY=suiprivkey1...

# Default LLM — leave OPENAI_API_KEY and nothing else for OpenAI + gpt-4o-mini
OPENAI_API_KEY=sk-...

# Free-text policy enforced by LLM on every match proposal
# Prices are 1e6-scaled USDC (1.00 USDC = 1_000_000)
# Sizes  are 1e9-scaled SUI  (1 SUI    = 1_000_000_000)
AGENT_POLICY=Accept matches within declared range. Call check_risk_cap first. Reject if within_cap=false.`}</CodeBlock>

            <SectionHeader>Demo mode (node dist/index.js demo)</SectionHeader>
            <CodeBlock lang="env">{`# Two funded testnet wallets. Each needs ~2 SUI for gas.
# Buyer also needs ≥ 0.22 USDC for collateral.
# USDC faucet: testnet USDC faucet (SUI faucet: https://faucet.testnet.sui.io)
DEMO_BUYER_KEY=suiprivkey1...
DEMO_SELLER_KEY=suiprivkey1...`}</CodeBlock>

            <SectionHeader>LLM provider (optional — defaults to OpenAI)</SectionHeader>
            <CodeBlock lang="env">{`# LLM_PROVIDER must be: openai | anthropic | google | openai-compatible
# LLM_API_KEY takes precedence over OPENAI_API_KEY when set.

# ── OpenAI ────────────────────────────────────────────────────────────────
# LLM_PROVIDER=openai
# LLM_MODEL=gpt-4o-mini           # or gpt-4o, o3-mini, gpt-4-turbo
# LLM_API_KEY=sk-...

# ── Anthropic Claude ──────────────────────────────────────────────────────
# LLM_PROVIDER=anthropic
# LLM_MODEL=claude-haiku-4-5-20251001   # fastest/cheapest
# LLM_MODEL=claude-sonnet-4-6           # best quality
# LLM_API_KEY=sk-ant-...

# ── Google Gemini ─────────────────────────────────────────────────────────
# LLM_PROVIDER=google
# LLM_MODEL=gemini-2.0-flash      # fast + tool-capable
# LLM_MODEL=gemini-2.5-pro        # best quality
# LLM_API_KEY=AIza...

# ── OpenAI-compatible (Ollama, vLLM, OpenRouter, Together, Groq…) ────────
# LLM_PROVIDER=openai-compatible
# LLM_BASE_URL=http://localhost:11434/v1   # Ollama local
# LLM_BASE_URL=https://openrouter.ai/api/v1
# LLM_BASE_URL=https://api.groq.com/openai/v1
# LLM_MODEL=llama-3.1-8b-instant
# LLM_API_KEY=                             # some endpoints need no key

OPENAI_MODEL=gpt-4o-mini         # legacy — ignored when LLM_MODEL set`}</CodeBlock>

            <SectionHeader>IOI parameters (run mode auto-posting)</SectionHeader>
            <CodeBlock lang="env">{`# Size  = raw u64 at 1e9 scale: 1 SUI  = 1_000_000_000
# Price = raw u64 at 1e6 scale: 1 USDC = 1_000_000
AGENT_IOI_SIDE=buy                  # buy | sell
AGENT_IOI_ASSET=0x2::sui::SUI
AGENT_IOI_SIZE_LO=100000000         # 0.1 SUI  — min size advertised
AGENT_IOI_SIZE_HI=200000000         # 0.2 SUI  — max size advertised
AGENT_IOI_PRICE_LO=900000           # 0.90 USDC — min price
AGENT_IOI_PRICE_HI=1100000          # 1.10 USDC — max price
AGENT_IOI_TTL_MIN=60                # re-post IOI every N minutes
AGENT_POLL_INTERVAL_SEC=15          # proposal poll interval (seconds)`}</CodeBlock>

            <SectionHeader>Risk caps (optional)</SectionHeader>
            <CodeBlock lang="env">{`# When > 0, check_risk_cap returns within_cap=false if limits would be breached.
# Include "Call check_risk_cap" in AGENT_POLICY to gate accepts on these.
# RISK_MAX_POSITION_SUI=0.3        # max net open position across all fills + orders
# RISK_DAILY_VOLUME_SUI=20.0       # max total filled SUI per UTC day`}</CodeBlock>

            <SectionHeader>Webhook (optional)</SectionHeader>
            <CodeBlock lang="env">{`# notify_webhook tool POSTs { event, data, ts } to this URL.
# Useful for Slack/Discord alerts and monitoring dashboards.
# Test URL: https://webhook.site
# WEBHOOK_URL=https://webhook.site/your-unique-id`}</CodeBlock>

            <SectionHeader>RWA / custom trading pair (optional)</SectionHeader>
            <CodeBlock lang="env">{`# Override to trade a non-SUI base asset (e.g. testnet TBILL mock)
# AGENT_BASE_COIN_TYPE=0x70d3c2d589fcbe55eff1be5eebbe5cf50f051c0a274e1e34cd383ecd8a107719::tbill::TBILL
# AGENT_BASE_DECIMALS=6
# AGENT_IOI_ASSET=0x70d3...::tbill::TBILL
# AGENT_IOI_SIZE_LO=1000000        # 1 TBILL  (6 decimals)
# AGENT_IOI_SIZE_HI=1000000000     # 1000 TBILL
# AGENT_IOI_PRICE_LO=1000000       # $1.00 USDC fixed NAV
# AGENT_IOI_PRICE_HI=1000000`}</CodeBlock>

            <SectionHeader>Sui + Walrus endpoints (optional — defaults hit public testnet)</SectionHeader>
            <CodeBlock lang="env">{`# SUI_RPC_URL=https://fullnode.testnet.sui.io
# WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
# WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space
# QUOTE_COIN_TYPE=0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC
# DEEPBOOK_INDEXER_URL=https://deepbook-indexer.testnet.mystenlabs.com
# DEEPBOOK_POOL_KEY=SUI_DBUSDC`}</CodeBlock>

            <SectionHeader>Shell on-chain artifact IDs (optional — pin to specific deployment)</SectionHeader>
            <CodeBlock lang="env">{`# Leave ALL commented to use defaults from config.ts (latest testnet republish).
# Uncomment only to pin against a specific old deployment for debugging.
# SHELL_PACKAGE_ID=0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e
# SHELL_PACKAGE_ID_LATEST=0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e
# SHELL_PACKAGE_ID_IOI_TYPES=0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e
# ENCLAVE_ID=0xd002490d7e22d122e4b35f31bef0899d763afe628d1bf8f481b4d4099b6631a6
# ENCLAVE_CONFIG_ID=0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504`}</CodeBlock>
          </>
        )}

        {section === 'tools' && (
          <>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-3">
              9 built-in tools. Before deciding on each proposal the LLM runs a bounded tool-use loop (max 6 rounds).
              It can call any combination of these tools to gather facts — current market price, its own balance,
              open risk position — before committing to <span className="text-primary">accept_match</span>, <span className="text-primary">reject_match</span>, or <span className="text-primary">wait</span>.
            </p>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-4">
              Tools execute server-side in the agent process. The LLM cannot call arbitrary code — only the registered tool functions.
              All errors are returned as <span className="text-primary">{"{ error: \"...\" }"}</span> so the LLM can react rather than crash.
              Click a tool to expand its full signature and parameters.
            </p>
            {BUILTIN_TOOLS.map(t => (
              <FnCard
                key={t.name}
                name={`${t.name}  →  ${t.returns}`}
                desc={t.desc}
                params={t.params as { name: string; type: string; desc: string; optional?: boolean }[]}
                sig={t.sig}
              />
            ))}
          </>
        )}

        {section === 'plugins' && (
          <>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-3">
              Drop a <span className="text-primary">.js</span> or <span className="text-primary">.mjs</span> file into <span className="text-primary">shell-agent/plugins/</span>. The agent auto-discovers and registers it at startup as <span className="text-primary">plugin__{'<name>'}</span>.
            </p>
            <Warn>.ts files are NOT loaded directly — compile to .js/.mjs first. The agent logs a warning and skips .ts files.</Warn>

            <SectionHeader>Plugin shape</SectionHeader>
            <CodeBlock lang="ts">{`// The Tool interface your default export must satisfy:
interface Tool {
  name: string;          // must be unique across all built-ins and MCP tools
  description: string;   // shown to the LLM in the tool list
  parameters: ZodSchema; // zod schema for args; z.object({}) for no args
  execute(args: z.infer<typeof parameters>, ctx: ToolCtx): Promise<unknown>;
}

interface ToolCtx {
  suiClient: SuiJsonRpcClient;   // live RPC client for testnet/mainnet
  sealClient: SealClient;         // Seal IBE client
  keypair:    Ed25519Keypair;     // agent's signing keypair
  address:    string;             // agent's Sui address
}`}</CodeBlock>

            <SectionHeader>Example plugin</SectionHeader>
            <CodeBlock lang="js">{`// plugins/my_oracle.mjs
import { z } from 'zod';

export default {
  name: 'my_oracle',
  description: 'Returns fair value for a given asset from my oracle',
  parameters: z.object({
    asset: z.string().optional().describe('Coin type, defaults to SUI'),
  }),
  async execute(args, ctx) {
    // ctx gives full Sui SDK access without any extra wiring
    const res = await fetch(
      \`https://my-oracle.example.com/price/\${args.asset ?? 'SUI'}\`
    );
    return await res.json();  // must be JSON-serialisable
  },
};`}</CodeBlock>
            <Note>Registered as <span className="text-primary">plugin__my_oracle</span>. Restart shell-agent after adding or editing a plugin. Plugins run in-process with full agent privileges — only load code you trust.</Note>

            <SectionHeader>Exporting multiple tools</SectionHeader>
            <CodeBlock lang="js">{`// plugins/multi.mjs
export default [toolA, toolB];   // array also accepted`}</CodeBlock>
          </>
        )}

        {section === 'mcp' && (
          <>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-3">
              MCP (Model Context Protocol) lets you connect any external data source or service to the agent
              without writing plugin code. The agent reads <span className="text-primary">mcp.json</span> at startup,
              connects to each listed server, and registers all its tools as{' '}
              <span className="text-primary">mcp__{'<server>'}__{'<toolName>'}</span> in the LLM tool list alongside built-ins.
            </p>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-3">
              Use cases: Pyth oracle prices, custom risk systems, compliance checks, Walrus blob reads,
              any service that exposes an MCP server. Both local processes (stdio) and remote HTTP servers are supported.
            </p>
            <Note>Missing mcp.json is silently ignored. Tool names are sanitised — any char outside <span className="text-primary">[a-zA-Z0-9_-]</span> is replaced with <span className="text-primary">_</span>.</Note>

            <SectionHeader>mcp.json format</SectionHeader>
            <CodeBlock lang="json">{`{
  "mcpServers": {
    "walrus": {
      "transport": "http",
      "url": "https://sui.furqaannabi.com/mcp"
    },
    "pyth": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "pyth-mcp-server"],
      "env": { "PYTH_NETWORK": "testnet" }
    }
  }
}`}</CodeBlock>

            <SectionHeader>Transports</SectionHeader>
            <table className="w-full text-left font-mono-sm text-mono-sm mb-4">
              <thead>
                <tr className="text-on-surface-variant border-b border-outline-variant">
                  <th className="pb-2 font-normal">Transport</th>
                  <th className="pb-2 font-normal">Fields</th>
                  <th className="pb-2 font-normal">Use case</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-outline-variant/30">
                  <td className="py-2 pr-4 text-primary">http</td>
                  <td className="py-2 pr-4 text-on-surface-variant">url</td>
                  <td className="py-2 text-on-surface-variant">Remote MCP server (Streamable HTTP)</td>
                </tr>
                <tr className="border-b border-outline-variant/30">
                  <td className="py-2 pr-4 text-primary">stdio</td>
                  <td className="py-2 pr-4 text-on-surface-variant">command, args?, env?</td>
                  <td className="py-2 text-on-surface-variant">Local process spawned at agent start</td>
                </tr>
              </tbody>
            </table>

            <SectionHeader>Naming example</SectionHeader>
            <CodeBlock>{`// server "walrus", tool "read_blob" → mcp__walrus__read_blob
// server "my-feed", tool "get.price" → mcp__my-feed__get_price  (dot → underscore)`}</CodeBlock>
          </>
        )}

        {section === 'policy' && (
          <>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-3">
              The <span className="text-primary">AGENT_POLICY</span> env is plain text appended to the LLM system prompt before every proposal evaluation. Write it like compliance rules — the LLM will call tools like <span className="text-primary">check_risk_cap</span> and <span className="text-primary">get_ref_price</span> to verify compliance, then set <span className="text-primary">policy_check: true</span> only when it has actually verified.
            </p>

            <SectionHeader>Example policies</SectionHeader>
            <CodeBlock lang="env">{`# Conservative market maker
AGENT_POLICY="Only accept SUI/USDC matches where agreed_price is within 0.5%
of the DeepBook mid (call get_ref_price to verify). Max position: 500 SUI.
Max daily volume: 2000 SUI. Call check_risk_cap with proposed_size_sui before
accepting. Reject if within_cap is false."

# RWA desk (TBILL, fixed NAV)
AGENT_POLICY="Accept any TBILL/USDC match where agreed_price is between
0.995 and 1.005. Max position: 10000 TBILL. Always verify balance first."

# Passive — accept everything within declared IOI range
AGENT_POLICY="Accept any match within declared range. Reject if size > 1000."`}</CodeBlock>

            <SectionHeader>System prompt structure</SectionHeader>
            <p className="font-mono-sm text-[11px] text-on-surface-variant mb-2">The full system prompt the LLM sees for each proposal:</p>
            <CodeBlock>{`You are a Shell Finance trading agent.
Your address: <agent_address>.
Your side on this proposal: buy | sell.
Your policy: <AGENT_POLICY>.

You have access to tools listed below. Before deciding, you SHOULD call
relevant tools to verify the trade fits your policy. Do not invent data.

When you have enough information, respond with ONLY a JSON object:
  { "decision": "accept_match" | "reject_match" | "wait",
    "reasoning": string,
    "policy_check": boolean }

Set policy_check=true only if the decision provably stays within the
declared policy (having actually checked it via tools when applicable).`}</CodeBlock>
          </>
        )}
      </div>
    </div>
  );
}

function SdkTab() {
  const SDK_FNS: { name: string; sig: string; desc: string; params: { name: string; type: string; desc: string; optional?: boolean }[] }[] = [
    {
      name: 'encryptOrder(opts)',
      desc: 'Seal-encrypts an order using IBE threshold encryption. Makes network calls to the Seal key server — requires internet. Returns the envelope, commit hash, and backup decryption key.',
      params: [
        { name: 'sealClient', type: 'SealClient', desc: 'Initialised Seal client' },
        { name: 'shellPackageId', type: 'string', desc: 'Shell Move package ID' },
        { name: 'threshold', type: 'number', desc: 'Key shares required (usually 1)' },
        { name: 'order.side', type: '"buy" | "sell"', desc: '' },
        { name: 'order.size', type: 'bigint', desc: 'Base token units (e.g. 1e9 for 1 SUI)' },
        { name: 'order.limitPrice', type: 'bigint', desc: 'Scaled ×1_000_000' },
        { name: 'order.expiryEpoch', type: 'bigint', desc: '' },
        { name: 'order.maxSlippageBps', type: 'number', desc: 'Basis points (hardcode 50)' },
        { name: 'order.asset', type: 'string', desc: 'Move coin type' },
      ],
      sig: `encryptOrder({
  sealClient, shellPackageId, threshold,
  order: { side, size, limitPrice, expiryEpoch, maxSlippageBps, asset }
}) => Promise<{
  sealedEnvelope: Uint8Array,
  commitHash: Uint8Array,
  backupKey: Uint8Array,
}>`,
    },
    {
      name: 'submitOrderTx(opts)',
      desc: 'Appends the submit_order PTB move call to a Transaction and returns it. Pass an existing tx to compose with other calls; omit to get a fresh one. Call after your collateral split.',
      params: [
        { name: 'shellPackageId', type: 'string', desc: '' },
        { name: 'collateralType', type: 'string', desc: 'Move coin type of collateral' },
        { name: 'collateral', type: 'TransactionArgument', desc: 'Coin object from splitCoins' },
        { name: 'sealedEnvelope', type: 'Uint8Array', desc: 'From encryptOrder' },
        { name: 'commitHash', type: 'Uint8Array', desc: 'From encryptOrder' },
        { name: 'expiryEpoch', type: 'bigint', desc: '' },
        { name: 'tx', type: 'Transaction', desc: 'Transaction to mutate' },
      ],
      sig: `submitOrderTx({
  shellPackageId, collateralType, collateral,
  sealedEnvelope, commitHash, expiryEpoch, tx?
}) => Transaction`,
    },
    {
      name: 'cancelOrderTx(opts)',
      desc: 'Builds a complete Transaction that cancels an expired OrderCommitment and returns collateral to recipient.',
      params: [
        { name: 'shellPackageId', type: 'string', desc: '' },
        { name: 'collateralType', type: 'string', desc: 'Move coin type' },
        { name: 'orderId', type: 'string', desc: 'ObjectId of the OrderCommitment' },
        { name: 'recipient', type: 'string', desc: 'Sui address to receive collateral' },
      ],
      sig: `cancelOrderTx({ shellPackageId, collateralType, orderId, recipient })
  => Transaction`,
    },
    {
      name: 'getActiveOrders(suiClient, opts)',
      desc: "Fetches live OrderCommitment objects for a trader. Queries OrderSubmitted events (paginates all pages), then prunes orders that no longer exist on-chain (settled, cancelled, or expired-and-deleted). Returns only orders with collateral still locked.",
      params: [
        { name: 'suiClient', type: 'SuiClient', desc: '' },
        { name: 'opts.shellPackageId', type: 'string', desc: '' },
        { name: 'opts.trader', type: 'string', desc: 'Sui address' },
        { name: 'opts.limit', type: 'number', desc: 'Max results', optional: true },
      ],
      sig: `getActiveOrders(suiClient, { shellPackageId, trader, limit? })
  => Promise<ActiveOrder[]>

// ActiveOrder:
// { orderId, commitHash, collateralType, expiryEpoch, submittedAtMs }`,
    },
    {
      name: 'getReceipts(suiClient, opts)',
      desc: 'Fetches SettlementReceipt objects owned by a wallet. Receipts are minted at settlement and never burned.',
      params: [
        { name: 'suiClient', type: 'SuiClient', desc: '' },
        { name: 'opts.shellPackageId', type: 'string', desc: '' },
        { name: 'opts.owner', type: 'string', desc: 'Sui address' },
      ],
      sig: `getReceipts(suiClient, { shellPackageId, owner })
  => Promise<Receipt[]>

// Receipt:
// { objectId, fields: { filled_price, filled_size, counterparty } }`,
    },
    {
      name: 'settleMatchTx(opts)',
      desc: 'Builds the settlement PTB used by the enclave/orchestrator. Calls attestation::verify (producing a MatchInstruction hot-potato), then settlement::settle consumes it atomically with both OrderCommitments. The two makerCollateralType / takerCollateralType type args must match each order\'s actual T — use getOrderCollateralType.',
      params: [
        { name: 'shellPackageId', type: 'string', desc: '' },
        { name: 'enclaveId', type: 'string', desc: 'Shared Enclave<SHELL> object id' },
        { name: 'timestampMs', type: 'bigint', desc: 'Enclave timestamp from MatchPayload' },
        { name: 'maker', type: 'string', desc: 'Maker agent Sui address' },
        { name: 'taker', type: 'string', desc: 'Taker agent Sui address' },
        { name: 'makerOrderId', type: 'string', desc: 'OrderCommitment object id (maker)' },
        { name: 'takerOrderId', type: 'string', desc: 'OrderCommitment object id (taker)' },
        { name: 'makerCollateralType', type: 'string', desc: 'Move coin type T of maker order' },
        { name: 'takerCollateralType', type: 'string', desc: 'Move coin type T of taker order' },
        { name: 'filledSize', type: 'bigint', desc: 'Agreed fill size in base units' },
        { name: 'filledPrice', type: 'bigint', desc: 'Agreed price ×1_000_000' },
        { name: 'deepbookTxDigest', type: 'Uint8Array', desc: '32-byte DeepBook tx digest from enclave' },
        { name: 'signature', type: 'Uint8Array', desc: '64-byte ed25519 signature over IntentMessage<MatchPayload>' },
        { name: 'tx', type: 'Transaction', desc: 'Optional — creates new if omitted', optional: true },
      ],
      sig: `settleMatchTx({
  shellPackageId, enclaveId, timestampMs,
  maker, taker,
  makerOrderId, takerOrderId,
  makerCollateralType, takerCollateralType,
  filledSize, filledPrice,
  deepbookTxDigest,  // Uint8Array 32 bytes
  signature,         // Uint8Array 64 bytes (ed25519)
  tx?,
}) => Transaction`,
    },
  ];

  return (
    <div className="w-full h-full overflow-y-auto pb-6">
      <p className="font-mono-sm text-[11px] text-on-surface-variant mb-6 max-w-2xl">
        <span className="text-primary">@shell-finance/sdk</span> is the TypeScript client library for building bots, scripts, and integrations against the Shell dark pool.
        It wraps <span className="text-secondary">@mysten/seal</span> for IBE order encryption and exposes typed helpers for every on-chain interaction — submitting orders, cancelling, querying open positions, and reading settlement receipts.
        The library is provider-agnostic: works in Node.js, browsers, and any Sui dApp that already uses <span className="text-secondary">@mysten/dapp-kit</span>.
      </p>
      <SectionHeader>Install</SectionHeader>
      <CodeBlock lang="sh">{`npm install @shell-finance/sdk @mysten/seal @mysten/sui`}</CodeBlock>

      <SectionHeader>Import</SectionHeader>
      <CodeBlock lang="ts">{`import {
  encryptOrder,
  submitOrderTx,
  cancelOrderTx,
  getActiveOrders,
  getReceipts,
  settleMatchTx,
} from '@shell-finance/sdk';`}</CodeBlock>

      <SectionHeader>API Reference</SectionHeader>
      <p className="font-mono-sm text-[11px] text-on-surface-variant mb-4">Click any function to expand its parameters and signature.</p>
      {SDK_FNS.map(f => (
        <FnCard
          key={f.name}
          name={f.name}
          desc={f.desc}
          params={f.params as { name: string; type: string; desc: string; optional?: boolean }[]}
          sig={f.sig}
        />
      ))}

      <SectionHeader>End-to-end example</SectionHeader>
      <Note>@mysten/sui 2.16+ renamed the RPC client. Import SuiJsonRpcClient from @mysten/sui/jsonRpc — not SuiClient from @mysten/sui/client.</Note>
      <CodeBlock lang="ts">{`// ── Node.js / script path ─────────────────────────────────────────
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SealClient } from '@mysten/seal';
import { encryptOrder, submitOrderTx } from '@shell-finance/sdk';

// 1. Clients
const suiClient = new SuiJsonRpcClient({
  url: 'https://fullnode.testnet.sui.io',
  network: 'testnet',
});
const sealClient = new SealClient({
  suiClient: suiClient as never,  // SealClient accepts SuiJsonRpcClient
  serverConfigs: [{
    objectId:     '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
    weight: 1,
  }],
  verifyKeyServers: false,
});

const keypair = Ed25519Keypair.fromSecretKey(process.env.PRIVATE_KEY!);

// 2. Current epoch → order expiry
const { epoch } = await suiClient.getLatestSuiSystemState();
const expiryEpoch = BigInt(epoch) + 5n;

// 3. Encrypt the order (calls Seal key server)
//    Sell order: collateral = SUI (base coin) → can split from gas
const enc = await encryptOrder({
  sealClient,
  shellPackageId: '0x23d1e8…',  // SHELL_PACKAGE_ID
  threshold: 1,
  order: {
    side: 'sell',
    size: 1_000_000_000n,    // 1 SUI (9 decimals)
    limitPrice: 2_000_000n,  // 2.00 USDC/SUI (6 decimals)
    expiryEpoch,
    maxSlippageBps: 50,
    asset: '0x2::sui::SUI',
  },
});

// 4. Build PTB — sell collateral is SUI, split from gas object
const tx = new Transaction();
const [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000n)]);

submitOrderTx({
  shellPackageId: '0x23d1e8…',
  collateralType: '0x2::sui::SUI',
  collateral,
  sealedEnvelope: enc.sealedEnvelope,
  commitHash:     enc.commitHash,
  expiryEpoch,
  tx,
});

// 5. Sign and execute
const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true },
});
console.log('Order committed:', result.digest);
// Persist enc.backupKey — only way to decrypt your order without the enclave`}</CodeBlock>

      <SectionHeader>TypeScript types</SectionHeader>
      <CodeBlock lang="ts">{`import type {
  ActiveOrder,            // return type of getActiveOrders
  SettlementReceiptFields,// fields on each receipt from getReceipts
  OrderSide,              // "buy" | "sell"
  EncryptOrderOptions,    // options bag for encryptOrder
  EncryptedOrder,         // return type of encryptOrder
  OrderPlaintext,         // order input shape
  SubmitOrderTxOptions,
  CancelOrderTxOptions,
  SettleMatchOptions,
} from '@shell-finance/sdk';`}</CodeBlock>
    </div>
  );
}

export default function DocsPage() {
  const [tab, setTab] = useState<Tab>('agent');

  return (
    <div className="flex flex-col w-full h-full overflow-hidden pr-2 lg:pr-0">
      {/* Header */}
      <div className="glass-panel p-4 rounded border border-outline-variant mb-gutter flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="font-headline-md text-body-base text-on-surface font-medium">Documentation</h1>
          <p className="font-mono-sm text-mono-sm text-on-surface-variant mt-0.5">
            Shell Agent &amp; TypeScript SDK — npm packages for quants and bots
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface-container-high border border-outline-variant rounded p-1">
          {(['agent', 'sdk'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded font-mono-sm text-mono-sm transition-colors cursor-pointer ${
                tab === t
                  ? 'bg-primary/10 border border-primary text-primary'
                  : 'text-on-surface-variant hover:text-on-surface border border-transparent'
              }`}
            >
              {t === 'agent' ? 'Shell Agent' : 'TypeScript SDK'}
            </button>
          ))}
        </div>
      </div>

      {/* Package badges */}
      <div className="flex items-center gap-3 mb-6 px-1 flex-shrink-0 flex-wrap">
        <span className="font-mono-sm text-[11px] text-on-surface-variant border border-outline-variant px-2 py-1 rounded">
          <span className="text-secondary">npm</span>  @shell-finance/shell-agent
        </span>
        <span className="font-mono-sm text-[11px] text-on-surface-variant border border-outline-variant px-2 py-1 rounded">
          <span className="text-secondary">npm</span>  @shell-finance/sdk
        </span>
        <span className="font-mono-sm text-[11px] text-on-surface-variant opacity-40">v0.1.0 · Sui testnet</span>
      </div>

      {/* Content */}
      <div className="glass-panel rounded border border-outline-variant p-6 flex-1 overflow-hidden flex flex-col min-h-0">
        {tab === 'agent' ? <AgentTab /> : <SdkTab />}
      </div>
    </div>
  );
}
