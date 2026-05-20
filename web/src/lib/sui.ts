import { SealClient } from '@mysten/seal';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

export type Network = 'testnet' | 'mainnet';

export const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as Network) || 'testnet';

// ── Per-network config ──────────────────────────────────────────────
interface NetworkConfig {
  shellPackageId: string;
  poolId: string;
  enclaveConfigId: string;
  enclaveId: string;                // shared Enclave<SHELL> object (empty if not registered)
  enclaveUrl: string;               // base URL of the matching enclave's HTTP server
  deepbookPoolKey: string;          // key used by @mysten/deepbook-v3
  quoteCoinType: string;            // USDC / DUSDC type tag (depends on network)
  quoteCoinScalar: bigint;          // 1e6 for both
  quoteSymbol: string;              // shown in UI
  sealKeyServer: {
    objectId: string;
    aggregatorUrl: string;
    weight: number;
  };
  verifyKeyServers: boolean;
  deepbookIndexerUrl: string;
}

const TESTNET: NetworkConfig = {
  shellPackageId: '0x6a9fb5d245856d9c81da6952b431dceebf870820766df0bee8a6339cb06a56fd',
  poolId: '0x0fbb5658e6e5f0ef13e134b21ed46c264959bdec6976ae52e2667aba2588569b',
  enclaveConfigId: '0xd33555df99c5065a610e479ad39f711ba0219da1f04276b3c2be71101f8f7bb8',
  enclaveId: '0xa6589585791e4f3aa80164cd98bf8fc3385ebe93ff64d0c371596e21362cc9c3',
  enclaveUrl: 'https://sui.furqaannabi.com',
  deepbookPoolKey: 'SUI_DBUSDC',
  quoteCoinType: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  quoteCoinScalar: BigInt(1_000_000),
  quoteSymbol: 'DUSDC',
  sealKeyServer: {
    objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
    weight: 1,
  },
  verifyKeyServers: false,
  deepbookIndexerUrl: 'https://deepbook-indexer.testnet.mystenlabs.com',
};

const MAINNET: NetworkConfig = {
  shellPackageId: '0x0',
  poolId: '0x0',
  enclaveConfigId: '0x0',
  enclaveId: '0x0',
  enclaveUrl: '',
  deepbookPoolKey: 'SUI_USDC',
  quoteCoinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  quoteCoinScalar: BigInt(1_000_000),
  quoteSymbol: 'USDC',
  sealKeyServer: {
    objectId: '0x0',
    aggregatorUrl: 'https://seal-aggregator-mainnet.mystenlabs.com',
    weight: 1,
  },
  verifyKeyServers: true,
  deepbookIndexerUrl: 'https://deepbook-indexer.mainnet.mystenlabs.com',
};

export const NETWORK_CONFIG: NetworkConfig = NETWORK === 'mainnet' ? MAINNET : TESTNET;

// ── Convenience re-exports ──────────────────────────────────────────
export const SHELL_PACKAGE_ID = NETWORK_CONFIG.shellPackageId;
export const POOL_ID = NETWORK_CONFIG.poolId;
export const ENCLAVE_CONFIG_ID = NETWORK_CONFIG.enclaveConfigId;
export const ENCLAVE_ID = NETWORK_CONFIG.enclaveId;
export const ENCLAVE_URL = NETWORK_CONFIG.enclaveUrl;
export const DEEPBOOK_POOL_KEY = NETWORK_CONFIG.deepbookPoolKey;
export const QUOTE_COIN_TYPE = NETWORK_CONFIG.quoteCoinType;
export const QUOTE_SYMBOL = NETWORK_CONFIG.quoteSymbol;
export const DEEPBOOK_INDEXER_URL = NETWORK_CONFIG.deepbookIndexerUrl;

// Base coin is SUI on both networks for now.
export const BASE_COIN_TYPE = '0x2::sui::SUI';

/**
 * Move type of the collateral coin for a given order side.
 * Buy → post quote (USDC/DBUSDC). Sell → post base (SUI).
 */
export function collateralTypeFor(side: 'buy' | 'sell'): string {
  return side === 'buy' ? QUOTE_COIN_TYPE : BASE_COIN_TYPE;
}

export const DEFAULT_COLLATERAL_AMOUNT = BigInt(10_000_000); // 0.01 SUI / 10 USDC (6-decimals)

// Kept for backwards-compat with existing imports — defaults to sell-side.
export const COLLATERAL_TYPE = BASE_COIN_TYPE;

// ── Seal client factory ─────────────────────────────────────────────
let _sealClient: SealClient | null = null;

export function getSealClient(suiClient: SuiJsonRpcClient): SealClient {
  if (!_sealClient) {
    _sealClient = new SealClient({
      suiClient,
      serverConfigs: [NETWORK_CONFIG.sealKeyServer],
      verifyKeyServers: NETWORK_CONFIG.verifyKeyServers,
    });
  }
  return _sealClient;
}
