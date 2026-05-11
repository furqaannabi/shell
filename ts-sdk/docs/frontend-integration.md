# Integrating `@shell-finance/sdk` in a frontend

Practical guide for wiring Shell into a Next.js / React app on Sui **testnet**. Vanilla TypeScript paths are noted where useful.

## What you can do today

| Flow                                   | Supported                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Encrypt an order envelope under Seal   | ✅ `encryptOrder()`                                                        |
| Submit an `OrderCommitment` on-chain   | ✅ `submitOrderTx()`                                                       |
| Cancel an expired order, reclaim funds | ⚠️ no SDK helper yet — call `shell::pool::cancel_expired<T>` directly      |
| Decrypt your own order (recovery)      | ⚠️ retain the `backupKey` returned by `encryptOrder` and feed it to Seal   |
| Watch for match settlement             | ⚠️ poll `SettlementReceipt` objects owned by the trader address           |

The match + settle flow runs inside the matching enclave. The frontend's job is **submit + observe**.

## Prerequisites

- **Sui wallet** in the browser (Sui Wallet, Suiet, etc.). For programmatic flows: any `Ed25519Keypair`.
- **Network**: testnet. Mainnet IDs aren't published yet.
- **Node 22+** for the build toolchain.

## Install

```bash
npm install @shell-finance/sdk @mysten/seal @mysten/sui @mysten/dapp-kit @tanstack/react-query
```

(`@mysten/dapp-kit` + `@tanstack/react-query` are only needed for the React/wallet path.)

## Deployment IDs (testnet)

Loaded from [`deployments/testnet.json`](../deployments/testnet.json):

```ts
import deployments from "@shell-finance/sdk/deployments/testnet.json";

const PACKAGE_ID    = deployments.packageId;        // 0x5a47e786…
const POOL_ID       = deployments.poolId;           // 0xedc28f54…
const ENCLAVE_CFG   = deployments.enclaveConfigId;  // 0x741c7a6c…
```

> Note: `deployments/` isn't part of the package's `exports` map yet. Import it relatively from your repo, or copy the values into a constants file.

## Construct the clients

### Sui RPC client

`@mysten/sui` 2.x renamed the JSON-RPC client. Use the `jsonRpc` subpath:

```ts
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const sui = new SuiJsonRpcClient({
  network: "testnet",
  url: getJsonRpcFullnodeUrl("testnet"),
});
```

### Seal client

One key server is enough for the testnet deployment:

```ts
import { SealClient } from "@mysten/seal";

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
```

Mainnet key-server object IDs will replace these when Shell deploys to mainnet.

## Encrypt + submit one order

```ts
import { encryptOrder, submitOrderTx } from "@shell-finance/sdk";
import { Transaction } from "@mysten/sui/transactions";

// Resolve the current epoch to set an order expiry.
const { epoch } = await sui.getLatestSuiSystemState();
const expiry = BigInt(epoch) + 5n; // valid for ~5 epochs

const enc = await encryptOrder({
  sealClient: seal,
  shellPackageId: PACKAGE_ID,
  threshold: 1,
  order: {
    side: "buy",
    size: 1_000n,
    limitPrice: 12_500n,
    expiryEpoch: expiry,
    maxSlippageBps: 50,
  },
});

// Persist enc.backupKey somewhere the trader controls — it lets them
// decrypt their own order without the enclave. enc.id is the 32-byte
// Seal identity; enc.commitHash is SHA-256(plaintext).

const tx = new Transaction();
const [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(10_000_000n)]); // 0.01 SUI
submitOrderTx({
  shellPackageId: PACKAGE_ID,
  collateralType: "0x2::sui::SUI",
  collateral,
  sealedEnvelope: enc.sealedEnvelope,
  commitHash: enc.commitHash,
  expiryEpoch: expiry,
  tx,
});
```

`tx` now holds the PTB. Sign and execute it with whichever signer you have.

## Wallet flow with dapp-kit (React)

```tsx
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";

function PlaceOrder() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  async function onSubmit(order: OrderPlaintext) {
    const enc = await encryptOrder({ sealClient, shellPackageId, threshold: 1, order });
    const tx = new Transaction();
    const [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(10_000_000n)]);
    submitOrderTx({
      shellPackageId,
      collateralType: "0x2::sui::SUI",
      collateral,
      sealedEnvelope: enc.sealedEnvelope,
      commitHash: enc.commitHash,
      expiryEpoch: order.expiryEpoch,
      tx,
    });

    const res = await signAndExecute({
      transaction: tx,
      options: { showObjectChanges: true, showEvents: true },
    });

    const created = res.objectChanges?.find(
      (c) => c.type === "created" && c.objectType?.includes("OrderCommitment"),
    );
    // Stash created.objectId — that's the trader-visible handle for this order.
    return { orderId: created?.objectId, digest: res.digest, backupKey: enc.backupKey };
  }
}
```

Wrap the app in `SuiClientProvider` + `WalletProvider` per the [dapp-kit docs](https://sdk.mystenlabs.com/dapp-kit). Use `useCurrentAccount()` to gate the form on a connected wallet.

## Observing receipts

After a match clears, the trader receives a `SettlementReceipt` object addressed to their wallet:

```ts
const receipts = await sui.getOwnedObjects({
  owner: traderAddress,
  filter: { StructType: `${PACKAGE_ID}::pool::SettlementReceipt` },
  options: { showContent: true },
});
```

Each receipt holds `filled_size`, `filled_price`, the counterparty address, and the enclave's signature — enough for an audit row.

## Persisting `backupKey`

The Seal client returns a 32-byte symmetric DEK at encrypt time. Today there is no SDK helper to decrypt with it (Seal's hybrid layout is internal), but **keep it anyway**: if the enclave fails or is misregistered, this is the only path to a trader-only recovery decrypt. Store it client-side, encrypted under the wallet's key if you have a signer-bound vault.

## Wire-level guarantees worth surfacing in UI

- The trader only ever sees ciphertext on-chain. The mempool sees ciphertext.
- The order's `commit_hash` (SHA-256 of the BCS plaintext) is emitted in `OrderSubmitted` — useful to display as "your order's fingerprint" before settlement.
- Expiry is in **epochs**, not seconds. ~24h per epoch on Sui mainnet, similar on testnet. The SDK does no conversion.

## Pitfalls

- The SuiClient class name changed. If you see `does not provide an export named 'SuiClient'`, you're on `@mysten/sui` ≥ 2.16. Use `SuiJsonRpcClient` from `@mysten/sui/jsonRpc`.
- `encryptOrder` accepts `bigint` for `size`, `limitPrice`, `expiryEpoch`. Don't pass JS numbers — anything above 2^53 will silently truncate.
- Make sure to `await sui.waitForTransaction({ digest })` between back-to-back PTBs from the same wallet, or you'll race the gas object's version.

## Not yet covered

- Cancel-order helper. Today: build the PTB by hand with `shell::pool::cancel_expired<T>` taking the `OrderCommitment` shared object.
- Mainnet IDs.
- A `decryptOrder()` recovery helper.
