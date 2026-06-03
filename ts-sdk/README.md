# @shell-finance/sdk

Client SDK for [Shell Finance](https://github.com/furqaannabi/shell) — a confidential dark pool on Sui: Seal-encrypted order envelopes, AWS Nitro enclave matching, atomic peer-to-peer settlement, multi-source price discovery (DeepBook / Pyth / fixed NAV).

- Trader-side **Seal** encryption of order envelopes (threshold IBE, Move-policy access control).
- PTB builders for `submit_order`, `cancel_anytime`, and the `verify_v2` → `settle_v3` settlement pipeline.
- Read helpers for fetching a trader's own active orders + settlement receipts straight from chain.
- Multi-pair: any `Coin<TBase> / Coin<TQuote>` works at the contract level; SDK is asset-agnostic.

## Install

```bash
npm install @shell-finance/sdk @mysten/seal @mysten/sui
```

## What it gives you

```ts
import {
  encryptOrder,
  encodeOrder,
  submitOrderTx,
  cancelOrderTx,
  settleMatchTx,
  getOrderCollateralType,
  getActiveOrders,
  getReceipts,
} from "@shell-finance/sdk";
```

| Export                     | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `encryptOrder`             | BCS-encode + Seal-IBE-encrypt an order; returns sealed envelope + commit hash + backup key. |
| `encodeOrder`              | BCS-encode an `OrderPlaintext` (without encryption). Useful for testing.                    |
| `submitOrderTx`            | Adds `shell::pool::submit_order<T>` call to an existing `Transaction`.                      |
| `cancelOrderTx`            | Builds a PTB calling `shell::pool::cancel_anytime<T>` to reclaim collateral after expiry.   |
| `settleMatchTx`            | Builds a PTB chaining `attestation::verify_v2` → `settlement::settle_v3<TBase, TQuote>`.    |
| `getOrderCollateralType`   | Returns the `T` of an `OrderCommitment<T>` from its on-chain type tag.                      |
| `getActiveOrders`          | Queries `OrderSubmitted` events + prunes dead/expired orders.                               |
| `getReceipts`              | Fetches a trader's owned `SettlementReceipt` objects (post-settlement).                     |

## Trader flow

```ts
import { SealClient } from "@mysten/seal";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { encryptOrder, submitOrderTx } from "@shell-finance/sdk";

const SHELL_PACKAGE_ID = "0x23d1e8b5..."; // your deployment
const USDC_TYPE = "0xa1ec7fc0...::usdc::USDC";

const sui = new SuiClient({ url: "https://fullnode.testnet.sui.io" });
const seal = new SealClient({
  suiClient: sui,
  serverConfigs: [
    {
      objectId: "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
      aggregatorUrl: "https://seal-aggregator-testnet.mystenlabs.com",
      weight: 1,
    },
  ],
  verifyKeyServers: false,
});

const { epoch } = await sui.getLatestSuiSystemState();
const expiryEpoch = BigInt(epoch) + 5n;

// Encrypt a 1 SUI buy order at 2.00 USDC limit.
const enc = await encryptOrder({
  sealClient: seal,
  shellPackageId: SHELL_PACKAGE_ID,
  threshold: 1,
  order: {
    side: "buy",
    size: 1_000_000_000n,       // 1 SUI (9 decimals)
    limitPrice: 2_000_000n,     // 2.00 USDC (1e6 quote-per-base scale)
    expiryEpoch,
    maxSlippageBps: 50,         // 0.5% slippage tolerance
    asset: "0x2::sui::SUI",     // base coin Move type
  },
});

// BUY collateral = trade_value + 0.1% protocol fee, in QUOTE coin (USDC).
//   trade_value = size × limitPrice / 1e9       = 2_000_000  raw (2.00 USDC)
//   fee_each    = trade_value × 10 / 10_000     = 2_000      raw (0.002 USDC)
const tradeValue = (1_000_000_000n * 2_000_000n) / 1_000_000_000n;  // 2_000_000
const feeEach    = (tradeValue * 10n) / 10_000n;                     // 2_000
const collateralAmount = tradeValue + feeEach;                       // 2_002_000

const tx = new Transaction();
const { data: coins } = await sui.getCoins({ owner: trader, coinType: USDC_TYPE });
const primary = tx.object(coins[0].coinObjectId);
if (coins.length > 1) {
  tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
}
const [collateral] = tx.splitCoins(primary, [tx.pure.u64(collateralAmount)]);

submitOrderTx({
  shellPackageId: SHELL_PACKAGE_ID,
  collateralType: USDC_TYPE,
  collateral,
  sealedEnvelope: enc.sealedEnvelope,
  commitHash: enc.commitHash,
  expiryEpoch,
  tx,
});

// sign + execute with whichever signer (wallet, keypair, dapp-kit, etc.)
```

For SELL orders, collateral is the BASE coin (e.g. SUI), amount = `size`. No fee added — the seller's fee is deducted at settlement from incoming quote proceeds.

## Settlement (enclave / orchestrator side)

```ts
import { getOrderCollateralType, settleMatchTx } from "@shell-finance/sdk";

const [tMaker, tTaker] = await Promise.all([
  getOrderCollateralType(sui, makerOrderId),
  getOrderCollateralType(sui, takerOrderId),
]);

const tx = settleMatchTx({
  shellPackageId: SHELL_PACKAGE_ID,
  poolId: "0x33682a96...",       // shared Pool object
  enclaveId: "0xd002490d...",    // shared Enclave<SHELL> object
  timestampMs,
  maker, taker, makerOrderId, takerOrderId,
  makerCollateralType: tMaker,
  takerCollateralType: tTaker,
  filledSize, filledPrice,
  baseDecimals: 9,               // 9 for SUI, 6 for TBILL etc. — per-pair scaling
  deepbookTxDigest,              // 32-byte Uint8Array from enclave's MatchPayloadV2
  signature,                     // 64-byte Ed25519 signature over IntentMessage<MatchPayloadV2>
});
```

`settle_v3` takes `base_decimals` so the same code path handles 9-decimal pairs (SUI/USDC) and 6-decimal RWA pairs (TBILL/USDC, USDY/USDC) without re-deploying Move code.

## Protocol fee

Shell takes **0.1% from both sides** at settlement, paid in QUOTE coin:

```
trade_value = filled_size × filled_price / 10^base_decimals
fee_each    = trade_value × 10 / 10_000        (0.1%)

Buyer net:  filled_size BASE       (full size received)
Seller net: trade_value − fee_each QUOTE
Treasury:   2 × fee_each QUOTE
```

Buyer pre-deposits `trade_value + fee_each`. Any price-improvement surplus (when fill price beats limit) is refunded to the buyer at settlement.

## Configuration

The SDK is deployment-agnostic. Pass your own `shellPackageId`, `poolId`, `enclaveId`, and Seal key-server config. The `deployments/testnet.json` in the repo is for the reference deployment; consumers should track their own.

## Frontend integration

Full dapp-kit walkthrough and API reference at **<https://shell-finance.vercel.app/docs>** (`SDK` tab). Covers `SuiClient` construction, the `@mysten/sui` 2.x import paths, every SDK function with live examples, and the trader → enclave → settlement lifecycle.

## Changelog

- **0.1.4** — `settleMatchTx` now targets `shell::settlement::settle_v4` (self-match-aware canonical entrypoint) and throws synchronously when `maker === taker`. No call-site changes required for consumers.
- **0.1.2** — Multi-source price discovery (DeepBook / Pyth / fixed NAV) descriptions; npm metadata polish.

## Stability

`0.1.x` — early. Breaking changes possible until `1.0`. Tracks the Shell Move package's on-chain interface; minor version bumps when the package introduces new `_v2/_v3/_v4` entrypoints.

## License

MIT
