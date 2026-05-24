# Republish Brief — Fresh Pool

## Why

Order matcher pairs by price-time priority over the whole decrypted book, not
by commit_hash bound to the IOI proposal. Result: accept-orders match arbitrary
stale OrderCommitments. Concrete case (2026-05-24):

- Tx `DmE4TkMa87ZrJs6QsogbhBmwG62zxXSgkTXnDTT7oviM` settled buyer `0x176b…`'s
  USDC accept against a stale **DUSDC** OrderCommitment from pre-USDC switch.
  Seller received 3,498,250 **DUSDC** instead of USDC.
- Buyer's actual USDC OrderCommitment (`0x8ede5b1d…`, 1.58925 USDC locked) +
  seller's actual SUI OrderCommitment (`0x98db50bf…`, 1.5 SUI locked) still
  sitting unmatched.

Stale book entries (5 alive at last check) keep poisoning new accepts. Cancel
fn exists but requires owner; some are from deleted wallets, unrecoverable.

Cleanest reset = republish.

## Teammate tasks

1. **Publish fresh package**
   ```
   cd move && sui client publish --gas-budget 1000000000
   ```
   Capture from output:
   - `packageId`
   - `poolId` (shared `Pool` object)
   - `enclaveConfigId` (shared `EnclaveConfig<SHELL>`)
   - `shellCapId`
   - `upgradeCapId`

2. **Register fresh enclave**
   Run the existing register flow against the new package → captures
   `enclaveId` (shared `Enclave<SHELL>` object).

3. **Update enclave constants** (`enclave-nitro/apps/shell/mod.rs`)
   ```rust
   const SHELL_PACKAGE_ID: &str        = "<new pkg>";
   const SHELL_PACKAGE_ID_LATEST: &str = "<new pkg>";  // same on fresh publish
   const ENCLAVE_CONFIG_ID: &str       = "<new cfg>";
   const DEFAULT_ENCLAVE_ID: &str      = "<new enclave>";
   const ORDER_SUBMITTED_EVENT: &str   = "<new pkg>::pool::OrderSubmitted";
   const IOIS_POSTED_EVENT: &str       = "<new pkg>::ioi::IoisPosted";
   ```

4. **Rebuild + deploy EIF**, set `SHELL_ENCLAVE_ID=<new enclave>` env.

5. **Verify** `/shell/status`:
   ```json
   { "order_book_size": 0, "ioi_book_size": 0, "proposed_pairs": 0,
     "order_poller_last_ok_ms": <recent>, "ioi_matcher_last_ok_ms": <recent> }
   ```

6. **Send the 5 new IDs** to client side:
   - packageId
   - poolId
   - enclaveConfigId
   - enclaveId
   - pcr0/pcr1 (for testnet.json metadata)

## Client side (handled by me after IDs land)

| File | Fields |
|---|---|
| `web/src/lib/sui.ts` | shellPackageId, shellPackageIdLatest, shellPackageIdIoiTypes (all = new pkg), poolId, enclaveConfigId, enclaveId |
| `shell-agent/src/config.ts` | same five |
| `ts-sdk/deployments/testnet.json` | full refresh |

Then commit + push, web auto-redeploys.

## Known follow-up (not blocking republish)

Order matcher should bind matches via commit_hash from the IOI MatchInstruction,
not free price-time priority over the whole decrypted book. Without this, the
moment any new stale commitment lands, same bug returns. Republish buys a
clean window but isn't a permanent fix.

## Trader side

- Old stuck collateral (in old pool) is abandoned; not migrating it.
- Both wallets need fresh USDC + SUI on the new package.
