import { config } from "./config.js";

export type PriceSource = "deepbook" | "fixed" | "pyth";
export type Network = "testnet" | "mainnet" | "both";

export interface TradingPair {
  symbol: string;
  /** Which Sui network this pair is valid on. */
  network: Network;
  baseCoinType: string;
  baseDecimals: number;
  quoteCoinType: string;
  quoteDecimals: number;
  priceSource: PriceSource;
  deepbookPoolKey?: string;
  fixedPrice?: number;
  pythFeedId?: string;
}

const SUI_TYPE = "0x2::sui::SUI";
const USDC_TESTNET =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
const USDC_MAINNET =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const TBILL_TESTNET =
  "0x70d3c2d589fcbe55eff1be5eebbe5cf50f051c0a274e1e34cd383ecd8a107719::tbill::TBILL";

// Pyth Hermes feed IDs — same id works against both networks.
// Source: https://pyth.network/developers/price-feed-ids
const PYTH_USDY_USD = "0xe786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a1e9a8a4c43afb4d";
// Placeholder — BUIDL has no public Pyth feed at time of writing.
// Users who want BUIDL wire it themselves via AGENT_EXTRA_PAIRS_JSON.

// Pyth indexes by ticker symbol (e.g. "BTC"), not Sui address. Map the Sui-native
// ticker subset we want to surface in the picker. Keep small — these are the majors
// where a wrapped/native Sui coin exists. USDC quote chosen because we settle in it.
//
// IMPORTANT — every entry must be: (a) a real coin type deployed on the target network,
// (b) decimals verified against the deployed CoinMetadata. Wrong values will mis-scale
// raw amounts in the UI. The values below are the only entries that have been verified
// at time of writing. Wormhole-bridged USDT on Sui mainnet is 6 decimals; the coin type
// resolves under wormhole's `::coin::COIN` module pattern.
//
// NOTE: web/src/app/api/pairs/route.ts has a copy of this map — keep in sync.
const PYTH_SUI_MAJORS: Array<{ symbol: string; baseCoinType: string; baseDecimals: number; network: Network }> = [
  // USDT (Wormhole bridged) — mainnet only. Verified.
  { symbol: "USDT/USDC", baseCoinType: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN", baseDecimals: 6, network: "mainnet" },
  // TODO mainnet: add verified Wormhole BTC/ETH/SOL coin types + their CoinMetadata-confirmed decimals.
];

const PYTH_TICKER_TO_FEED: Record<string, string> = {
  // Filled from https://hermes.pyth.network/v2/price_feeds?query=<TICKER>
  "USDT": "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  "USDY": "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a1e9a8a4c43afb4d",
};

export const DEFAULT_PAIRS: TradingPair[] = [
  // SUI/USDC works on both networks via DeepBook.
  {
    symbol: "SUI/USDC",
    network: "both",
    baseCoinType: SUI_TYPE,
    baseDecimals: 9,
    quoteCoinType: USDC_TESTNET, // overridden at runtime if mainnet
    quoteDecimals: 6,
    priceSource: "deepbook",
    deepbookPoolKey: "SUI_DBUSDC",
  },
  // TBILL is a mock token Shell deployed on testnet only.
  {
    symbol: "TBILL/USDC",
    network: "testnet",
    baseCoinType: TBILL_TESTNET,
    baseDecimals: 6,
    quoteCoinType: USDC_TESTNET,
    quoteDecimals: 6,
    priceSource: "fixed",
    fixedPrice: 1.0,
  },
  // USDY (Ondo) — real RWA, mainnet only. Pyth Hermes feed.
  // Address placeholder — set the real one when adopting USDY on Sui mainnet.
  {
    symbol: "USDY/USDC",
    network: "mainnet",
    baseCoinType: "0x0000000000000000000000000000000000000000000000000000000000000000::usdy::USDY",
    baseDecimals: 6,
    quoteCoinType: USDC_MAINNET,
    quoteDecimals: 6,
    priceSource: "pyth",
    pythFeedId: PYTH_USDY_USD,
  },
];

/** Parse AGENT_EXTRA_PAIRS_JSON env. Invalid entries silently dropped
 *  with a console warning so a bad config can't crash the agent. */
export function loadExtraPairsFromEnv(): TradingPair[] {
  const raw = config.extraPairsJson;
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`[pairs] AGENT_EXTRA_PAIRS_JSON parse failed: ${(e as Error).message}`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn(`[pairs] AGENT_EXTRA_PAIRS_JSON must be an array`);
    return [];
  }
  const out: TradingPair[] = [];
  for (const entry of parsed) {
    const p = entry as Partial<TradingPair>;
    if (!p.baseCoinType || !p.quoteCoinType || !p.priceSource) {
      console.warn(`[pairs] skipping pair missing required fields: ${JSON.stringify(p)}`);
      continue;
    }
    if (p.priceSource === "deepbook" && !p.deepbookPoolKey) {
      console.warn(`[pairs] skipping deepbook pair without deepbookPoolKey: ${p.baseCoinType}`);
      continue;
    }
    if (p.priceSource === "fixed" && typeof p.fixedPrice !== "number") {
      console.warn(`[pairs] skipping fixed pair without fixedPrice: ${p.baseCoinType}`);
      continue;
    }
    if (p.priceSource === "pyth" && !p.pythFeedId) {
      console.warn(`[pairs] skipping pyth pair without pythFeedId: ${p.baseCoinType}`);
      continue;
    }
    out.push({
      symbol: p.symbol ?? `${p.baseCoinType.split("::").pop()}/${p.quoteCoinType.split("::").pop()}`,
      network: p.network ?? "both",
      baseCoinType: p.baseCoinType,
      baseDecimals: typeof p.baseDecimals === "number" ? p.baseDecimals : 6,
      quoteCoinType: p.quoteCoinType,
      quoteDecimals: typeof p.quoteDecimals === "number" ? p.quoteDecimals : 6,
      priceSource: p.priceSource,
      deepbookPoolKey: p.deepbookPoolKey,
      fixedPrice: p.fixedPrice,
      pythFeedId: p.pythFeedId,
    });
  }
  return out;
}

/** All known pairs: env overrides + defaults, filtered to current network.
 *  Env wins on baseCoinType collision so users can override a default
 *  pair's pricing. */
export function allPairs(): TradingPair[] {
  const extras = loadExtraPairsFromEnv();
  const seen = new Set(extras.map((p) => p.baseCoinType));
  const merged = [...extras, ...DEFAULT_PAIRS.filter((p) => !seen.has(p.baseCoinType))];
  const net = config.network;
  return merged.filter((p) => p.network === "both" || p.network === net);
}

export function pairForAsset(asset: string): TradingPair | undefined {
  return allPairs().find((p) => p.baseCoinType === asset);
}

// ───────────────────────────────────────────────────────────────────────
// Dynamic pair discovery — DeepBook indexer + Pyth Hermes
// ───────────────────────────────────────────────────────────────────────

interface DeepBookPool {
  pool_id: string;
  pool_name: string;
  base_asset_id: string;
  base_asset_decimals: number;
  base_asset_symbol: string;
  quote_asset_id: string;
  quote_asset_decimals: number;
  quote_asset_symbol: string;
}

interface PythFeed {
  id: string;
  attributes: { base: string; quote_currency: string; display_symbol: string; asset_type: string };
}

const PAIR_CACHE_TTL_MS = 5 * 60 * 1000;
const pairCache: Map<Network, { pairs: TradingPair[]; expiresAt: number }> = new Map();

export async function loadDeepBookPairs(): Promise<TradingPair[]> {
  try {
    const res = await fetch(`${config.deepbookIndexerUrl}/get_pools`);
    if (!res.ok) {
      console.warn(`[pairs] deepbook indexer ${res.status}`);
      return [];
    }
    const pools = (await res.json()) as DeepBookPool[];
    return pools.map((p) => ({
      symbol: `${p.base_asset_symbol}/${p.quote_asset_symbol}`,
      network: config.network as Network,
      baseCoinType: p.base_asset_id,
      baseDecimals: p.base_asset_decimals,
      quoteCoinType: p.quote_asset_id,
      quoteDecimals: p.quote_asset_decimals,
      priceSource: "deepbook" as const,
      deepbookPoolKey: p.pool_name,
    }));
  } catch (e) {
    console.warn(`[pairs] deepbook fetch failed: ${(e as Error).message}`);
    return [];
  }
}

export async function loadPythPairs(): Promise<TradingPair[]> {
  const quoteCoinType = config.network === "mainnet" ? USDC_MAINNET : USDC_TESTNET;
  const out: TradingPair[] = [];
  for (const major of PYTH_SUI_MAJORS) {
    if (major.network !== "both" && major.network !== config.network) continue;
    const ticker = major.symbol.split("/")[0];
    const feedId = PYTH_TICKER_TO_FEED[ticker];
    if (!feedId) continue;
    out.push({
      symbol: major.symbol,
      network: major.network,
      baseCoinType: major.baseCoinType,
      baseDecimals: major.baseDecimals,
      quoteCoinType,
      quoteDecimals: 6,
      priceSource: "pyth",
      pythFeedId: feedId,
    });
  }
  return out;
}

/** Merged dynamic + static + env pairs. 5-min memoized per network. */
export async function allPairsAsync(): Promise<TradingPair[]> {
  const net = config.network as Network;
  const cached = pairCache.get(net);
  if (cached && cached.expiresAt > Date.now()) return cached.pairs;

  const [deepbook, pyth] = await Promise.all([loadDeepBookPairs(), loadPythPairs()]);
  const extras = loadExtraPairsFromEnv();
  const seen = new Set<string>();
  const merged: TradingPair[] = [];
  // Priority: env > deepbook > pyth > static defaults. First-seen wins per coin type.
  for (const list of [extras, deepbook, pyth, DEFAULT_PAIRS]) {
    for (const p of list) {
      if (p.network !== "both" && p.network !== net) continue;
      if (seen.has(p.baseCoinType)) continue;
      seen.add(p.baseCoinType);
      merged.push(p);
    }
  }
  pairCache.set(net, { pairs: merged, expiresAt: Date.now() + PAIR_CACHE_TTL_MS });
  return merged;
}

export async function pairForAssetAsync(asset: string): Promise<TradingPair | undefined> {
  const list = await allPairsAsync();
  return list.find((p) => p.baseCoinType === asset);
}
