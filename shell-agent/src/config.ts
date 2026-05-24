import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  agentPrivateKey: optional("AGENT_PRIVATE_KEY"),
  // ── LLM provider config ──────────────────────────────────────────────
  // v2: pluggable provider. Defaults preserve pre-v2 OPENAI_API_KEY-only behaviour.
  llmProvider: optional("LLM_PROVIDER"),       // openai | anthropic | google | openai-compatible
  llmModel: optional("LLM_MODEL"),
  llmApiKey: optional("LLM_API_KEY"),
  llmBaseUrl: optional("LLM_BASE_URL"),
  // Legacy keys — still honoured when LLM_* are unset.
  openaiApiKey: optional("OPENAI_API_KEY"),
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  suiRpcUrl: process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io",
  walrusAggregator:
    process.env.WALRUS_AGGREGATOR ??
    "https://aggregator.walrus-testnet.walrus.space",
  walrusPublisher:
    process.env.WALRUS_PUBLISHER ??
    "https://publisher.walrus-testnet.walrus.space",
  // Fresh publish 2026-05-24: packageId == original-id == latest published-at
  // == ioi-types package id, all the same on a clean-slate publish.
  shellPackageId:
    process.env.SHELL_PACKAGE_ID ??
    "0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e",
  shellPackageIdLatest:
    process.env.SHELL_PACKAGE_ID_LATEST ??
    "0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e",
  shellPackageIdIoiTypes:
    process.env.SHELL_PACKAGE_ID_IOI_TYPES ??
    "0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e",
  enclaveId:
    process.env.ENCLAVE_ID ??
    "0x92101a18928039d3da63ea9e8c1fa300bdce3edb473c69ce686d2a413bd1848a",
  enclaveConfigId:
    process.env.ENCLAVE_CONFIG_ID ??
    "0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504",
  agentPolicy:
    process.env.AGENT_POLICY ??
    "Accept any match within declared range. Reject if size > 1000.",
  // IOI parameters used by the auto-posting loop in `run` mode.
  ioiSide: (process.env.AGENT_IOI_SIDE ?? "buy") as "buy" | "sell",
  ioiAsset: process.env.AGENT_IOI_ASSET ?? "0x2::sui::SUI",
  ioiSizeLo: BigInt(process.env.AGENT_IOI_SIZE_LO ?? "1000000000"),   // 1 SUI
  ioiSizeHi: BigInt(process.env.AGENT_IOI_SIZE_HI ?? "10000000000"),  // 10 SUI
  // Price scale: DeepBook quote-per-base (1e6 for SUI/DUSDC, matches SealedOrderForm + IOIForm).
  ioiPriceLo: BigInt(process.env.AGENT_IOI_PRICE_LO ?? "1800000"), // 1.80
  ioiPriceHi: BigInt(process.env.AGENT_IOI_PRICE_HI ?? "2200000"), // 2.20
  ioiTtlMin: parseInt(process.env.AGENT_IOI_TTL_MIN ?? "60", 10),
};
