import { SealClient } from '@mysten/seal';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

export type Network = 'testnet' | 'mainnet';

export const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as Network) || 'testnet';

// ── Per-network config ──────────────────────────────────────────────
interface NetworkConfig {
  shellPackageId: string;          // original-id — pool::* event filters, Seal identity
  shellPackageIdLatest: string;    // latest published-at — moveCall targets for v2+ functions
  // Pinned to the upgrade that first introduced the `ioi` module.
  // Event type ids are rooted at the package that defined the type, so
  // ioi::MatchProposed / ioi::IoisPosted always tag at v2 even after
  // later upgrades. Used only for event filters, never for moveCall.
  shellPackageIdIoiTypes: string;
  poolId: string;
  enclaveConfigId: string;
  enclaveId: string;                // shared Enclave<SHELL> object (empty if not registered)
  enclaveUrl: string;               // base URL of the matching enclave's HTTP server
  // DeepBook pool key for the reference orderbook display only (Shell
  // settles via settle_direct, not through DeepBook). Testnet has no
  // SUI_USDC pool, so we use SUI_DBUSDC as a near-equivalent SUI/$ ref.
  deepbookPoolKey: string;
  quoteCoinType: string;            // USDC type tag (per-network)
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
  shellPackageId: '0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e',
  shellPackageIdLatest: '0x275cf49740a458b3ca92e85ca387b84dd16bd0466dd58efceb97614846e95031',
  shellPackageIdIoiTypes: '0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e',
  poolId: '0x33682a9652567989b094989fcabe9eda53fbde32c4a3e0204657a06510bab22b',
  enclaveConfigId: '0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504',
  enclaveId: '0xd002490d7e22d122e4b35f31bef0899d763afe628d1bf8f481b4d4099b6631a6',
  enclaveUrl: 'https://sui.furqaannabi.com',
  deepbookPoolKey: 'SUI_DBUSDC',
  quoteCoinType: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
  quoteCoinScalar: BigInt(1_000_000),
  quoteSymbol: 'USDC',
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
  shellPackageIdLatest: '0x0',
  shellPackageIdIoiTypes: '0x0',
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
export const SHELL_PACKAGE_ID_LATEST = NETWORK_CONFIG.shellPackageIdLatest;
export const SHELL_PACKAGE_ID_IOI_TYPES = NETWORK_CONFIG.shellPackageIdIoiTypes;
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
 * Buy → post quote (USDC). Sell → post base coin.
 * Accepts optional pair — defaults to SUI/USDC.
 */
export function collateralTypeFor(side: 'buy' | 'sell', pair?: TradingPair): string {
  if (pair) return side === 'buy' ? pair.quoteCoinType : pair.baseCoinType;
  return side === 'buy' ? QUOTE_COIN_TYPE : BASE_COIN_TYPE;
}

export const DEFAULT_COLLATERAL_AMOUNT = BigInt(10_000_000); // 0.01 SUI / 10 USDC (6-decimals)

// Kept for backwards-compat with existing imports — defaults to sell-side.
export const COLLATERAL_TYPE = BASE_COIN_TYPE;

// ── Multi-pair trading config ────────────────────────────────────────

export interface TradingPair {
  enabled: boolean;
  label?: string;
  baseSymbol: string;
  baseCoinType: string;
  baseDecimals: number;
  quoteSymbol: string;
  quoteCoinType: string;
  quoteDecimals: number;
  deepbookPoolKey: string | null;
  priceSource: 'deepbook' | 'fixed';
  fixedPrice?: number;
  /** Sui TransferPolicy object ID — set for policy-gated RWA tokens. */
  transferPolicyId?: string;
  /** Human-readable reason this pair is disabled on the current network. */
  disabledReason?: string;
}

// TBILL coin type is set after publishing rwa-mock package.
// Set NEXT_PUBLIC_TBILL_COIN_TYPE in .env.local after `sui client publish rwa-mock/`.
const TBILL_COIN_TYPE = process.env.NEXT_PUBLIC_TBILL_COIN_TYPE ?? '';

const MAINNET_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export const TRADING_PAIRS: TradingPair[] = [
  {
    enabled: true,
    baseSymbol: 'SUI', baseCoinType: BASE_COIN_TYPE, baseDecimals: 9,
    quoteSymbol: QUOTE_SYMBOL, quoteCoinType: QUOTE_COIN_TYPE, quoteDecimals: 6,
    deepbookPoolKey: DEEPBOOK_POOL_KEY, priceSource: 'deepbook',
  },
  {
    // Testnet mock only — shown on mainnet as disabled.
    enabled: NETWORK === 'testnet' && !!TBILL_COIN_TYPE,
    label: 'T-Bill (Mock)',
    baseSymbol: 'TBILL', baseCoinType: TBILL_COIN_TYPE || 'pending', baseDecimals: 6,
    quoteSymbol: QUOTE_SYMBOL, quoteCoinType: QUOTE_COIN_TYPE, quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00,
    disabledReason: NETWORK === 'mainnet' ? 'Testnet only' : (!TBILL_COIN_TYPE ? 'Set NEXT_PUBLIC_TBILL_COIN_TYPE' : undefined),
  },
  {
    enabled: NETWORK === 'mainnet',
    label: 'USDY',
    baseSymbol: 'USDY',
    baseCoinType: '0x0000000000000000000000000000000000000000000000000000000000000000::usdy::USDY',
    baseDecimals: 6,
    quoteSymbol: 'USDC', quoteCoinType: MAINNET_USDC, quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00,
    disabledReason: NETWORK !== 'mainnet' ? 'Mainnet only' : undefined,
  },
  {
    enabled: NETWORK === 'mainnet',
    label: 'BENJI',
    baseSymbol: 'BENJI',
    baseCoinType: '0x0000000000000000000000000000000000000000000000000000000000000001::benji::BENJI',
    baseDecimals: 6,
    quoteSymbol: 'USDC', quoteCoinType: MAINNET_USDC, quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00,
    disabledReason: NETWORK !== 'mainnet' ? 'Mainnet only' : undefined,
  },
  {
    enabled: NETWORK === 'mainnet',
    label: 'BUIDL',
    baseSymbol: 'BUIDL',
    baseCoinType: '0x0000000000000000000000000000000000000000000000000000000000000002::buidl::BUIDL',
    baseDecimals: 6,
    quoteSymbol: 'USDC', quoteCoinType: MAINNET_USDC, quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00,
    disabledReason: NETWORK !== 'mainnet' ? 'Mainnet only' : undefined,
  },
];

// All pairs shown in UI; only enabled ones are selectable.
export const DEFAULT_PAIR = TRADING_PAIRS.find((p) => p.enabled) ?? TRADING_PAIRS[0]!;

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
