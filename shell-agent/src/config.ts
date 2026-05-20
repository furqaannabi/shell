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
  shellPackageId:
    process.env.SHELL_PACKAGE_ID ??
    "0x6a9fb5d245856d9c81da6952b431dceebf870820766df0bee8a6339cb06a56fd",
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
};
