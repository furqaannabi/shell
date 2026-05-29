import { config } from "./config.js";

export type PriceSource = "deepbook" | "fixed" | "pyth";

export interface TradingPair {
  symbol: string;
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
const TBILL_TESTNET =
  "0x70d3c2d589fcbe55eff1be5eebbe5cf50f051c0a274e1e34cd383ecd8a107719::tbill::TBILL";

export const DEFAULT_PAIRS: TradingPair[] = [
  {
    symbol: "SUI/USDC",
    baseCoinType: SUI_TYPE,
    baseDecimals: 9,
    quoteCoinType: USDC_TESTNET,
    quoteDecimals: 6,
    priceSource: "deepbook",
    deepbookPoolKey: "SUI_DBUSDC",
  },
  {
    symbol: "TBILL/USDC",
    baseCoinType: TBILL_TESTNET,
    baseDecimals: 6,
    quoteCoinType: USDC_TESTNET,
    quoteDecimals: 6,
    priceSource: "fixed",
    fixedPrice: 1.0,
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

/** All known pairs: env overrides + defaults. Env wins on baseCoinType
 *  collision so users can override a default pair's pricing. */
export function allPairs(): TradingPair[] {
  const extras = loadExtraPairsFromEnv();
  const seen = new Set(extras.map((p) => p.baseCoinType));
  return [...extras, ...DEFAULT_PAIRS.filter((p) => !seen.has(p.baseCoinType))];
}

export function pairForAsset(asset: string): TradingPair | undefined {
  return allPairs().find((p) => p.baseCoinType === asset);
}
