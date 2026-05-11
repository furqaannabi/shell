import { SealClient } from '@mysten/seal';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

// ── Testnet deployment IDs ──────────────────────────────────────────
// Source: ts-sdk/deployments/testnet.json
export const SHELL_PACKAGE_ID = '0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd';
export const POOL_ID = '0xedc28f54b442ab2422ed8bab35e7a4ebcbc96baa7393d61704fc633503fccdae';
export const ENCLAVE_CONFIG_ID = '0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f';

// ── Seal key server config (testnet) ────────────────────────────────
const SEAL_KEY_SERVER = {
  objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
  aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
  weight: 1,
} as const;

// ── Collateral config ───────────────────────────────────────────────
export const COLLATERAL_TYPE = '0x2::sui::SUI';
export const DEFAULT_COLLATERAL_AMOUNT = BigInt(10_000_000); // 0.01 SUI — testnet default

// ── Seal client factory ─────────────────────────────────────────────
let _sealClient: SealClient | null = null;

/** Lazily create a SealClient bound to the given Sui RPC client. */
export function getSealClient(suiClient: SuiJsonRpcClient): SealClient {
  if (!_sealClient) {
    _sealClient = new SealClient({
      suiClient,
      serverConfigs: [SEAL_KEY_SERVER],
      verifyKeyServers: false, // testnet only — enable for mainnet
    });
  }
  return _sealClient;
}
