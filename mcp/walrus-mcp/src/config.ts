// Centralised runtime config for the Walrus MCP server. Resolved from
// environment variables at boot; tools import from here so the env
// surface is documented in one place.
//
// The defaults assume Walrus testnet's public publisher + aggregator,
// which require no wallet for writes (publisher absorbs WAL) or reads.

export type WalrusContext = "testnet" | "mainnet";

export interface Config {
  context: WalrusContext;
  publisher: string;
  aggregator: string;
  memwal?: {
    delegateKey: string;
    accountId: string;
    serverUrl: string;
    namespace: string;
  };
  // Optional Sui keypair for tools that mutate Sui state (extend, delete,
  // head_pointer writes). Absent in zero-install mode.
  suiKeyPairPath?: string;
}

const TESTNET_DEFAULTS = {
  publisher: "https://publisher.walrus-testnet.walrus.space",
  aggregator: "https://aggregator.walrus-testnet.walrus.space",
};

const MAINNET_DEFAULTS = {
  publisher: "https://publisher.walrus.space",
  aggregator: "https://aggregator.walrus.space",
};

export function loadConfig(): Config {
  const context = (process.env.WALRUS_CONTEXT ?? "testnet") as WalrusContext;
  const defaults = context === "mainnet" ? MAINNET_DEFAULTS : TESTNET_DEFAULTS;

  const cfg: Config = {
    context,
    publisher: process.env.WALRUS_PUBLISHER ?? defaults.publisher,
    aggregator: process.env.WALRUS_AGGREGATOR ?? defaults.aggregator,
    suiKeyPairPath: process.env.WALRUS_KEYPAIR_PATH,
  };

  const k = process.env.MEMWAL_DELEGATE_KEY;
  const a = process.env.MEMWAL_ACCOUNT_ID;
  const s = process.env.MEMWAL_SERVER_URL;
  if (k && a && s) {
    cfg.memwal = {
      delegateKey: k,
      accountId: a,
      serverUrl: s,
      namespace: process.env.MEMWAL_NAMESPACE ?? "default",
    };
  }

  return cfg;
}
