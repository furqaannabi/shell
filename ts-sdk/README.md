# @shell-finance/sdk

Client SDK for [Shell Finance](https://github.com/furqaannabi/shell) — a confidential order flow layer on DeepBook (Sui).

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

const enc = await encryptOrder({
  sealClient: seal,
  shellPackageId: "0x…",       // your Shell deployment
  threshold: 1,
  order: {
    side: "buy",
    size: 1_000n,
    limitPrice: 12_500n,
    expiryEpoch: 1234n,
    maxSlippageBps: 50,
  },
});

const tx = new Transaction();
const [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(10_000_000n)]);
submitOrderTx({
  shellPackageId: "0x…",
  collateralType: "0x2::sui::SUI",
  collateral,
  sealedEnvelope: enc.sealedEnvelope,
  commitHash: enc.commitHash,
  expiryEpoch: 1234n,
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
  filledSize, filledPrice, deepbookTxDigest, signature,
});
```

## Configuration

The SDK is deployment-agnostic. Pass your own `shellPackageId`, `enclaveId`, and Seal key-server config. The `deployments/testnet.json` in the repo is for the reference deployment; consumers should track their own.

## Frontend integration

See [`docs/frontend-integration.md`](https://github.com/furqaannabi/shell/blob/main/ts-sdk/docs/frontend-integration.md) in the repo for a full dapp-kit walkthrough, including the `@mysten/sui` 2.x naming notes that bite if you copy-paste from older guides.

## Stability

`0.1.x` — early. Breaking changes possible until 1.0. Tracks the Shell Move package's on-chain interface.

## License

MIT
