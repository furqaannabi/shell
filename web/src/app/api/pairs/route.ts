import { NextResponse } from "next/server";

export const revalidate = 300;

export type PriceSource = "deepbook" | "pyth" | "fixed";

export interface TradingPair {
  symbol: string;
  baseCoinType: string;
  baseDecimals: number;
  quoteCoinType: string;
  quoteDecimals: number;
  priceSource: PriceSource;
  deepbookPoolKey?: string;
  pythFeedId?: string;
  fixedPrice?: number;
  enabled?: boolean;
  disabledReason?: string;
}

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as "testnet" | "mainnet";

const DEEPBOOK_INDEXER =
  NETWORK === "mainnet"
    ? "https://deepbook-indexer.mainnet.mystenlabs.com"
    : "https://deepbook-indexer.testnet.mystenlabs.com";

const USDC_TESTNET = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
const USDC_MAINNET = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const USDC = NETWORK === "mainnet" ? USDC_MAINNET : USDC_TESTNET;

// Keep this map in sync with shell-agent/src/pairs.ts PYTH_SUI_MAJORS.
// `network` = the Sui network where the coin type actually exists. Entries that
// don't match the current network are surfaced as disabled "Mainnet only" previews
// in the picker so testnet demos can show the broader pair universe without claiming
// false coverage.
const PYTH_MAJORS = [
  // Wormhole-bridged majors. Coin type addresses + decimals from Wormhole's Sui deploy.
  { symbol: "BTC/USDC", base: "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN", decimals: 8, ticker: "BTC", network: "mainnet" as const },
  { symbol: "ETH/USDC", base: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN", decimals: 8, ticker: "ETH", network: "mainnet" as const },
  { symbol: "USDT/USDC", base: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN", decimals: 6, ticker: "USDT", network: "mainnet" as const },
];

const PYTH_FEEDS: Record<string, string> = {
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  USDT: "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  USDY: "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a1e9a8a4c43afb4d",
};

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

async function loadDeepBook(): Promise<TradingPair[]> {
  try {
    const r = await fetch(`${DEEPBOOK_INDEXER}/get_pools`, { next: { revalidate: 300 } });
    if (!r.ok) return [];
    const pools = (await r.json()) as DeepBookPool[];
    return pools.map((p) => ({
      symbol: `${p.base_asset_symbol}/${p.quote_asset_symbol}`,
      baseCoinType: p.base_asset_id,
      baseDecimals: p.base_asset_decimals,
      quoteCoinType: p.quote_asset_id,
      quoteDecimals: p.quote_asset_decimals,
      priceSource: "deepbook" as const,
      deepbookPoolKey: p.pool_name,
    }));
  } catch {
    return [];
  }
}

function loadPyth(): TradingPair[] {
  return PYTH_MAJORS.map((m) => {
    const enabled = m.network === NETWORK;
    return {
      symbol: m.symbol,
      baseCoinType: m.base,
      baseDecimals: m.decimals,
      quoteCoinType: USDC,
      quoteDecimals: 6,
      priceSource: "pyth" as const,
      pythFeedId: PYTH_FEEDS[m.ticker],
      enabled,
      disabledReason: enabled ? undefined : `${m.network === "mainnet" ? "Mainnet" : "Testnet"} only`,
    };
  });
}

export async function GET() {
  const [deepbook, pyth] = await Promise.all([loadDeepBook(), Promise.resolve(loadPyth())]);
  const seen = new Set<string>();
  const merged: TradingPair[] = [];
  for (const p of [...deepbook, ...pyth]) {
    if (seen.has(p.baseCoinType)) continue;
    seen.add(p.baseCoinType);
    merged.push(p);
  }
  return NextResponse.json(merged);
}
