import "dotenv/config";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

const NETWORK = (process.env.AGENT_NETWORK ?? "testnet") as "testnet" | "mainnet";

// ─────────────────────────────────────────────────────────────────────
// Per-network defaults. Mirrors web/src/lib/sui.ts NETWORK_CONFIG.
// Individual env vars override these per field.
// Mainnet Shell IDs are 0x0 placeholders — Shell isn't deployed to mainnet
// yet. Users running on mainnet must explicitly set SHELL_PACKAGE_ID etc.
// ─────────────────────────────────────────────────────────────────────

interface NetworkDefaults {
  suiRpcUrl: string;
  walrusAggregator: string;
  walrusPublisher: string;
  shellPackageId: string;
  shellPackageIdLatest: string;
  shellPackageIdIoiTypes: string;
  enclaveId: string;
  enclaveConfigId: string;
  quoteCoinType: string;
  deepbookIndexerUrl: string;
  deepbookPoolKey: string;
}

const TESTNET_DEFAULTS: NetworkDefaults = {
  suiRpcUrl: "https://fullnode.testnet.sui.io",
  walrusAggregator: "https://aggregator.walrus-testnet.walrus.space",
  walrusPublisher: "https://publisher.walrus-testnet.walrus.space",
  shellPackageId: "0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e",
  shellPackageIdLatest: "0x275cf49740a458b3ca92e85ca387b84dd16bd0466dd58efceb97614846e95031",
  shellPackageIdIoiTypes: "0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e",
  enclaveId: "0xd002490d7e22d122e4b35f31bef0899d763afe628d1bf8f481b4d4099b6631a6",
  enclaveConfigId: "0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504",
  quoteCoinType: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  deepbookIndexerUrl: "https://deepbook-indexer.testnet.mystenlabs.com",
  deepbookPoolKey: "SUI_DBUSDC",
};

const MAINNET_DEFAULTS: NetworkDefaults = {
  suiRpcUrl: "https://fullnode.mainnet.sui.io",
  walrusAggregator: "https://aggregator.walrus.space",
  walrusPublisher: "https://publisher.walrus.space",
  // Shell not yet deployed to mainnet — users must set these.
  shellPackageId: "0x0",
  shellPackageIdLatest: "0x0",
  shellPackageIdIoiTypes: "0x0",
  enclaveId: "0x0",
  enclaveConfigId: "0x0",
  quoteCoinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  deepbookIndexerUrl: "https://deepbook-indexer.mainnet.mystenlabs.com",
  deepbookPoolKey: "SUI_USDC",
};

const N = NETWORK === "mainnet" ? MAINNET_DEFAULTS : TESTNET_DEFAULTS;

export const config = {
  agentPrivateKey: optional("AGENT_PRIVATE_KEY"),
  // ── LLM provider config ──────────────────────────────────────────────
  llmProvider: optional("LLM_PROVIDER"),
  llmModel: optional("LLM_MODEL"),
  llmApiKey: optional("LLM_API_KEY"),
  llmBaseUrl: optional("LLM_BASE_URL"),
  openaiApiKey: optional("OPENAI_API_KEY"),
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  // ── Network ──────────────────────────────────────────────────────────
  network: NETWORK,
  // ── Network-derived (env vars override per field) ────────────────────
  suiRpcUrl: process.env.SUI_RPC_URL ?? N.suiRpcUrl,
  walrusAggregator: process.env.WALRUS_AGGREGATOR ?? N.walrusAggregator,
  walrusPublisher: process.env.WALRUS_PUBLISHER ?? N.walrusPublisher,
  shellPackageId: process.env.SHELL_PACKAGE_ID ?? N.shellPackageId,
  shellPackageIdLatest: process.env.SHELL_PACKAGE_ID_LATEST ?? N.shellPackageIdLatest,
  shellPackageIdIoiTypes: process.env.SHELL_PACKAGE_ID_IOI_TYPES ?? N.shellPackageIdIoiTypes,
  enclaveId: process.env.ENCLAVE_ID ?? N.enclaveId,
  enclaveConfigId: process.env.ENCLAVE_CONFIG_ID ?? N.enclaveConfigId,
  quoteCoinType: process.env.QUOTE_COIN_TYPE ?? N.quoteCoinType,
  deepbookIndexerUrl: process.env.DEEPBOOK_INDEXER_URL ?? N.deepbookIndexerUrl,
  deepbookPoolKey: process.env.DEEPBOOK_POOL_KEY ?? N.deepbookPoolKey,
  // ── Trading policy ───────────────────────────────────────────────────
  agentPolicy:
    process.env.AGENT_POLICY ??
    "Accept any match within declared range. Reject if size > 1000.",
  // ── IOI fallback defaults (LLM picks terms each window from policy) ──
  ioiSide: (process.env.AGENT_IOI_SIDE ?? "buy") as "buy" | "sell",
  ioiAsset: process.env.AGENT_IOI_ASSET ?? "0x2::sui::SUI",
  ioiSizeLo: BigInt(process.env.AGENT_IOI_SIZE_LO ?? "1000000000"),
  ioiSizeHi: BigInt(process.env.AGENT_IOI_SIZE_HI ?? "10000000000"),
  ioiPriceLo: BigInt(process.env.AGENT_IOI_PRICE_LO ?? "1800000"),
  ioiPriceHi: BigInt(process.env.AGENT_IOI_PRICE_HI ?? "2200000"),
  ioiTtlMin: parseInt(process.env.AGENT_IOI_TTL_MIN ?? "60", 10),
  pollIntervalSec: parseInt(process.env.AGENT_POLL_INTERVAL_SEC ?? "15", 10),
  // ── Base coin config (SUI default, override for RWA pairs) ───────────
  baseCoinType: process.env.AGENT_BASE_COIN_TYPE ?? "0x2::sui::SUI",
  baseDecimals: parseInt(process.env.AGENT_BASE_DECIMALS ?? "9", 10),
  // ── Risk caps (optional) ─────────────────────────────────────────────
  riskMaxPositionSui: parseFloat(process.env.RISK_MAX_POSITION_SUI ?? "0"),
  riskDailyVolumeSui: parseFloat(process.env.RISK_DAILY_VOLUME_SUI ?? "0"),
  // ── Webhook (optional) ───────────────────────────────────────────────
  webhookUrl: optional("WEBHOOK_URL"),
  // ── Extra trading pairs (JSON array of TradingPair) ──────────────────
  extraPairsJson: optional("AGENT_EXTRA_PAIRS_JSON"),
};
