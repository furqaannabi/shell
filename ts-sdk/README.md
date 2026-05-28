# @shell-finance/sdk

Client SDK for [Shell Finance](https://github.com/furqaannabi/shell) — a confidential order flow layer on Sui.

- Trader-side **Seal** encryption of order envelopes (threshold IBE, Move-policy access control).
- PTB builders for `submit_order`, `cancel_expired`, and the verify→settle pipeline.
- Read helpers for fetching a trader's own active orders + settlement receipts straight from chain.

## Install

```bash
npm install @shell-finance/sdk @mysten/seal @mysten/sui
```

## What it gives you

```ts
import {
  encryptOrder,
  submitOrderTx,
  cancelOrderTx,
  settleMatchTx,
  getOrderCollateralType,
  getActiveOrders,
  getReceipts,
} from "@shell-finance/sdk";
```

| Export                     | Shape                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| `encryptOrder`             | BCS-encode + Seal-IBE-encrypt an order; returns sealed envelope + commit hash + backup key. |
| `submitOrderTx`            | Builds a PTB calling `shell::pool::submit_order<T>`.             |
| `cancelOrderTx`            | Builds a PTB calling `shell::pool::cancel_expired<T>`.           |
| `settleMatchTx`            | Builds a PTB chaining `attestation::verify` → `settlement::settle`. |
| `getOrderCollateralType`   | Returns the `T` of an `OrderCommitment<T>` from its on-chain type tag. |
| `getActiveOrders`          | Queries `OrderSubmitted` events + prunes dead orders.            |
| `getReceipts`              | Fetches a trader's owned `SettlementReceipt` objects.            |

## Trader flow

```ts
import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { encryptOrder, submitOrderTx } from "@shell-finance/sdk";

const sui = new SuiJsonRpcClient({
  network: "testnet",
  url: getJsonRpcFullnodeUrl("testnet"),
});

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
const expiryEpoch = BigInt(epoch) + 5n;   // valid for ~5 epochs

const enc = await encryptOrder({
  sealClient: seal,
  shellPackageId: "0x…",       // your Shell deployment
  threshold: 1,
  order: {
    side: "buy",
    size: 1_000_000_000n,       // 1 SUI (9 decimals)
    limitPrice: 2_000_000n,     // 2.00 USDC (6 decimals, quote-per-base)
    expiryEpoch,
    maxSlippageBps: 50,         // 0.5% slippage tolerance
  },
});

// For a buy order, collateral = size × limitPrice / 1e9 ≈ 2 USDC.
// Here we use SUI as collateral for illustration; swap collateralType for USDC orders.
const tx = new Transaction();
const [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(2_000_000_000n)]); // 2 SUI
submitOrderTx({
  shellPackageId: "0x…",
  collateralType: "0x2::sui::SUI",
  collateral,
  sealedEnvelope: enc.sealedEnvelope,
  commitHash: enc.commitHash,
  expiryEpoch,
  tx,
});
// sign + execute tx with whichever signer
```

For the orchestrator/keeper side (matching a pair and settling):

```ts
import { getOrderCollateralType, settleMatchTx } from "@shell-finance/sdk";

const [tMaker, tTaker] = await Promise.all([
  getOrderCollateralType(sui, makerOrderId),
  getOrderCollateralType(sui, takerOrderId),
]);

const tx = settleMatchTx({
  shellPackageId: "0x…",
  enclaveId: "0x…",
  timestampMs,
  maker, taker, makerOrderId, takerOrderId,
  makerCollateralType: tMaker,
  takerCollateralType: tTaker,
  filledSize, filledPrice,
  deepbookTxDigest,   // 32-byte Uint8Array from the enclave's MatchPayload
  signature,          // 64-byte ed25519 signature over IntentMessage<MatchPayload>
});
```

## Configuration

The SDK is deployment-agnostic. Pass your own `shellPackageId`, `enclaveId`, and Seal key-server config. The `deployments/testnet.json` in the repo is for the reference deployment; consumers should track their own.

## Frontend integration

Full dapp-kit walkthrough and API reference at [shell.finance/docs](https://shell.finance/docs) (also accessible at `/docs` in the deployed app). Covers client setup, SealClient construction, the `@mysten/sui` 2.x import rename, and all SDK functions with live examples.

## Stability

`0.1.x` — early. Breaking changes possible until 1.0. Tracks the Shell Move package's on-chain interface.

## License

MIT
