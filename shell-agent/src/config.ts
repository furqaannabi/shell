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
  openaiApiKey: optional("OPENAI_API_KEY"),
  suiRpcUrl: process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io",
  walrusAggregator:
    process.env.WALRUS_AGGREGATOR ??
    "https://aggregator.walrus-testnet.walrus.space",
  walrusPublisher:
    process.env.WALRUS_PUBLISHER ??
    "https://publisher.walrus-testnet.walrus.space",
  // original-id — event filters, Seal identity
  shellPackageId:
    process.env.SHELL_PACKAGE_ID ??
    "0x6a9fb5d245856d9c81da6952b431dceebf870820766df0bee8a6339cb06a56fd",
  // latest published-at — moveCall targets for v2+ functions (e.g. ioi::record_ioi)
  shellPackageIdLatest:
    process.env.SHELL_PACKAGE_ID_LATEST ??
    "0x68aae56cb6571f9dd95f9225f2afc778181406edc9c6b0a6ed9e3d67910933aa",
  enclaveId:
    process.env.ENCLAVE_ID ??
    "0xe342ee55ef3b0107669318d9d9b3ced045afe5424e7dec265ee39e28d25cf948",
  enclaveConfigId:
    process.env.ENCLAVE_CONFIG_ID ??
    "0xd33555df99c5065a610e479ad39f711ba0219da1f04276b3c2be71101f8f7bb8",
  agentPolicy:
    process.env.AGENT_POLICY ??
    "Accept any match within declared range. Reject if size > 1000.",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  // IOI parameters used by the auto-posting loop in `run` mode.
  ioiSide: (process.env.AGENT_IOI_SIDE ?? "buy") as "buy" | "sell",
  ioiAsset: process.env.AGENT_IOI_ASSET ?? "0x2::sui::SUI",
  ioiSizeLo: BigInt(process.env.AGENT_IOI_SIZE_LO ?? "1000000000"),   // 1 SUI
  ioiSizeHi: BigInt(process.env.AGENT_IOI_SIZE_HI ?? "10000000000"),  // 10 SUI
  ioiPriceLo: BigInt(process.env.AGENT_IOI_PRICE_LO ?? "1800000000"), // 1.80
  ioiPriceHi: BigInt(process.env.AGENT_IOI_PRICE_HI ?? "2200000000"), // 2.20
  ioiTtlMin: parseInt(process.env.AGENT_IOI_TTL_MIN ?? "60", 10),
};
