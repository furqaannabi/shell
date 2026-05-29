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
