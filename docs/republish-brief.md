# Republish — Fresh Pool (Executed 2026-05-24)

> **Status: shipped.** New package at
> `0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e`.
> Full E2E IOI → match → accept → `settle_direct` re-tested green on
> the clean slate (settle tx
> [`2b96TNRe788nXw82bRyU4FpXA28RyMdMwUEsHRnAPKig`](https://suiscan.xyz/testnet/tx/2b96TNRe788nXw82bRyU4FpXA28RyMdMwUEsHRnAPKig)).
> The matcher's commit_hash binding follow-up (see §"Known follow-up")
> is **not** fixed by this republish — it stays open.
>
> **Note (later edits):** the `EnclaveConfig` PCR set + `Enclave<SHELL>`
> registration have rotated since the republish — both `update_pcrs` and
> a fresh `register_enclave` are run after every EIF rebuild. The
> `packageId` / `poolId` / `EnclaveConfigId` / `Cap<SHELL>` /
> `UpgradeCap` IDs in the table below are still authoritative; for the
> *current* `Enclave<SHELL>` id + PCR set, see the README's "On-chain
> testnet artifacts" table or `ts-sdk/deployments/testnet.json`.

## Why we republished

The IOI matcher pairs decrypted orders by free price-time priority over
the whole in-enclave book, without binding the eventual `submit_order`
acceptance back to the `commit_hash` baked into the originating IOI's
`MatchInstruction`. Once any stale `OrderCommitment` (e.g. left over
from the DUSDC → USDC trader-side switch) was still sitting in the
shared `Pool`, a new accept could be matched against it instead of the
correct counterparty.

Concrete bad settle on 2026-05-24:

- Tx `DmE4TkMa87ZrJs6QsogbhBmwG62zxXSgkTXnDTT7oviM` paired buyer
  `0x176b…`'s **USDC** accept-order against a stale **DUSDC**
  OrderCommitment from before the trader-side stablecoin switch.
- The seller received **3,498,250 DUSDC** instead of USDC.
- The buyer's actual USDC OrderCommitment (`0x8ede5b1d…`, 1.58925 USDC
  locked) and the seller's actual SUI OrderCommitment (`0x98db50bf…`,
  1.5 SUI locked) stayed unmatched, locked, orphaned.

Five stale entries were alive in the old pool at the time. `cancel_anytime`
exists for owner-driven recovery but several came from abandoned test
wallets (no signing keys remain), so on-chain cleanup wasn't an option.

The cleanest reset was a fresh publish: new `packageId` resets every
event-type identity and mints a brand-new shared `Pool` object, so the
in-enclave order book and IOI book start empty and the stale on-chain
commitments are no longer addressable from the new code path.

## New on-chain IDs (testnet)

| Object | ID |
| --- | --- |
| `packageId` (== `original-id` == latest published-at, fresh publish) | `0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e` |
| `poolId` (shared `Pool`) | `0x33682a9652567989b094989fcabe9eda53fbde32c4a3e0204657a06510bab22b` |
| `EnclaveConfig<SHELL>` (shared) | `0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504` |
| `Cap<SHELL>` (owned by deployer) | `0x0c71e66d311f26a6dfa7ebbfb0dfc924439f503a5e7ac70280f92544c11770ef` |
| `UpgradeCap` | `0x85f63ef069759e511e9d82281071978e71d9b0e2a15930bcf86dae02c02ced55` |
| `Enclave<SHELL>` (at republish moment) | `0x92101a18928039d3da63ea9e8c1fa300bdce3edb473c69ce686d2a413bd1848a` ([rotated since](../README.md#on-chain-testnet-artifacts)) |
| PCR0 / PCR1 (at republish moment) | `0xd7849795f42536b18b704a623625415863093a6583ddda8d8569eb641c7c763322d2d29bc30a84d5ecbe172dd9a3a88c` ([rotated since](../README.md#on-chain-testnet-artifacts)) |
| PCR2 (AWS-Nitro standard) | `0x21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a` |
| Enclave Sui address (eph_kp-derived) | `0xeda60f47715ea94dae92a58467894f3882d18d8690a348df6e03b4e3cfef1114` |
| Enclave Ed25519 pubkey (persistent seed) | `0x6fea82e844451e5c029253ebb91428a08df4868c098a44ebc8289bb0ee114613` |

Previous (now-orphaned) IDs are preserved in
[`ts-sdk/deployments/testnet.json`](../ts-sdk/deployments/testnet.json)
under `previous*` fields for audit purposes.

## What ran, in order

1. **`sui client publish --gas-budget 900000000`** from `move/` after
   deleting `Move.lock` + `Published.toml`. Captured the five IDs above
   from the tx output. Move tests already passing 9/9 from the prior
   commit. Cost ≈ 0.05 SUI.

2. **Enclave constants** in
   [`enclave-nitro/apps/shell/mod.rs`](../enclave-nitro/apps/shell/mod.rs):
   `SHELL_PACKAGE_ID`, `SHELL_PACKAGE_ID_LATEST`, `ENCLAVE_CONFIG_ID`,
   `ORDER_SUBMITTED_EVENT`, `IOIS_POSTED_EVENT`, `MATCH_PROPOSED_EVENT`
   all repointed at the new package. `DEFAULT_ENCLAVE_ID` set to
   `0x0…0` (the real id arrives via VSOCK secrets at boot, since
   `register_enclave` runs after the first EIF lands). Synced into
   `nautilus/src/nautilus-server/src/apps/shell/mod.rs` (build-context
   copy).

3. **scp + `make ENCLAVE_APP=shell`** on EC2 — fresh EIF, PCR0 lands at
   `0xd7849795…`. ~7 min build.

4. **`nitro-cli terminate-enclave` + `run-enclave`** with the new EIF.
   Persistent eph_kp survives because `enclave-seed.hex` is host-managed
   and pushed in via `expose_enclave.sh` over VSOCK secrets; pk
   reproduces as `0x6fea82e8…` across reboots.

5. **`enclave::update_pcrs`** (deployer-signed, using the new
   `Cap<SHELL>` + new `EnclaveConfig`) — burns the new PCR set into the
   on-chain config.

6. **`register_enclave.sh`** against the new package — fetches a fresh
   attestation from the live enclave, calls `register_enclave`, mints a
   shared `Enclave<SHELL>` at `0x92101a18…` with the persistent pk
   bound to the new PCR-pinned config.

7. **Push `SHELL_ENCLAVE_ID` via VSOCK secrets**: wrote the new id into
   `/home/ec2-user/shell-enclave-id.txt`, terminated + relaunched the
   enclave, re-ran `expose_enclave.sh` so the secrets blob (containing
   the new `SHELL_ENCLAVE_ID` env var) reaches the freshly-started
   enclave's one-shot VSOCK secrets listener.

8. **Client configs** repointed at the new IDs:
   [`ts-sdk/deployments/testnet.json`](../ts-sdk/deployments/testnet.json),
   [`web/src/lib/sui.ts`](../web/src/lib/sui.ts),
   [`shell-agent/src/config.ts`](../shell-agent/src/config.ts).
   Comment in [`shell-agent/src/proposals.ts`](../shell-agent/src/proposals.ts)
   trimmed (no v2-upgrade backstory on a fresh publish).

9. **Verify `/shell/status`** returns clean state:

   ```json
   {
     "order_poller_last_ok_ms": <recent>,
     "ioi_matcher_last_ok_ms":  <recent>,
     "order_book_size": 0,
     "ioi_book_size":   0,
     "proposed_pairs":  0
   }
   ```

   Both supervisor task timestamps advancing confirms the supervisor +
   bootstrap fix from `38dc0cf` is healthy on the new package.

10. **Commit + push**: `bfbec7c` on `main`.

## E2E re-test on the clean package

Run 2026-05-24, both wallets pre-funded (deployer with 0.85 SUI + 20
USDC; counterparty topped up to 0.75 SUI + 2 USDC via a manual
`sui client transfer` from deployer):

| Step | Tx | Notes |
| --- | --- | --- |
| Sell IOI from deployer (1 SUI base, 0.1–0.2 SUI, $1.00–$1.20) | `4CtFN9GjyHprZCo8eUthXC51gsuk97vY1ay1SEUpmqzp` | blob `r9bloLYi…` |
| Buy IOI from counterparty (1 SUI base, 0.1–0.2 SUI, $1.05–$1.20) | `5DM2UpNRzAfDo3bdAF1EY4VzZ6kqi5DwLhAWEPSL6rej` | blob `W18jmCFu…` |
| Enclave matches → `ioi::propose_match` | `6Gzo394SVurDfNcgfQRv4nt3aGGBwWAyw2xQSCsZtp7x` | 20:41 UTC |
| Deployer accepts sell → `pool::submit_order` | `A9ovNNJAivKUDCaQqTMZJ8ZFdpbukFfWcw83qGaLd7B8` | accept-once returned **1** proposal (no stale candidates — clean slate held) |
| Counterparty accepts buy → `pool::submit_order` | `4idgUAcoeRQtuB5GjfrxFRA3yqpq6X2HnsU6VdsT8MsD` | same |
| Enclave settles → `attestation::verify` + `settlement::settle_direct<SUI, USDC>` | [`2b96TNRe788nXw82bRyU4FpXA28RyMdMwUEsHRnAPKig`](https://suiscan.xyz/testnet/tx/2b96TNRe788nXw82bRyU4FpXA28RyMdMwUEsHRnAPKig) | 20:44 UTC, status success |

Balance changes from the settle tx:
- Deployer gained **0.168750 USDC** (sold 0.15 SUI @ 1.125).
- Counterparty gained **0.150000 SUI**.
- Enclave paid **0.001475 SUI** in gas.

`SettlementReceipt` objects minted:
- Deployer: `0x2a020aab…` (filled_size 150_000_000, filled_price 1_125_000)
- Counterparty: `0xcec2dc0c…` (same)

`/shell/status` immediately after settle: books back to `0 / 0`,
`proposed_pairs: 1` (the just-settled pair, kept in the in-memory
idempotency set until its expiry). Both supervisor timestamps still
advancing.

Total wall-clock from "post first IOI" to "settle landed": ~3 min,
dominated by the 15 s IOI-matcher poll cycle and the 5 s order-poller
cycle.

## Known follow-up — NOT addressed by this republish

The original bug is structural: the matcher pairs by free price-time
priority over the decrypted book, not by `commit_hash` from the IOI's
`MatchInstruction`. Republish only buys a clean window — the moment a
new stale `OrderCommitment` lands (which will happen the next time
*anyone* posts an order and doesn't follow through), the same poisoning
behavior returns.

The proper fix: settle / accept paths must verify that the
`OrderCommitment.commit_hash` matches the `commit_hash` recorded inside
the enclave's signed `MatchInstruction`. If a counterparty submits an
acceptance against a different commitment than the one the enclave
matched, the PTB must abort. Sketch:

- Extend `MatchPayload` (and the BCS schema in `attestation::verify`)
  to carry both expected `commit_hash` fields.
- Have `settle_direct` assert
  `OrderCommitment.commit_hash == instruction.expected_commit_hash`
  for both sides before crossing collateral.
- Trader-side `submit_order` already publishes a `commit_hash`; the
  enclave already has it from the IOI ciphertext. Only the on-chain
  verification step is missing.

Until that lands, treat the clean-slate as ephemeral.

## Trader-side hygiene

- The previous pool's locked collateral is intentionally abandoned. The
  *old* package's `pool::cancel_anytime` still works for owners with
  signing keys; this brief deliberately does not provide a migration
  script.
- Both test wallets had to be topped up on the new package's coin
  types before the E2E re-test (`sui client transfer` of 2 USDC
  deployer → counterparty; SUI gas covered from prior balances).
- Anyone with collateral they care about in the old pool should call
  `cancel_anytime` themselves before the old pool gets fully forgotten.
