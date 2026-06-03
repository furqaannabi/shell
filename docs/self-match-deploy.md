# Self-match prevention — deploy runbook

Implementation complete. This file lists every command to ship the change to testnet. Run in order; each step verifies the previous.

## Pre-flight

```bash
# Confirm Move tests pass
cd /Users/a0000/projects/shell/move && sui move test 2>&1 | tail -3
# expect: Total tests: 11; passed: 11; failed: 0

# Confirm SDK builds + smoke passes
cd /Users/a0000/projects/shell/ts-sdk
npm run build && node scripts/self-match-smoke.mjs
# expect: PASS x2
```

## 1. Move package upgrade

Requires `sui client` switched to deployer key holding `UpgradeCap = 0x85f63ef0…`.

```bash
cd /Users/a0000/projects/shell/move
sui client upgrade --upgrade-capability 0x85f63ef069759e511e9d82281071978e71d9b0e2a15930bcf86dae02c02ced55 --gas-budget 500000000
```

Record the new package ID from the output (look for `Published Objects → packageId`).

Update `ts-sdk/deployments/testnet.json`:

```bash
# In ts-sdk/deployments/testnet.json, set "shellPackageIdLatest" to the new id.
# Keep "shellPackageId" pointing at the original 0x23d1e8b5… for Seal identity.
```

## 2. Enclave EIF rebuild

Requires SSH to the m5.xlarge running at `sui.furqaannabi.com`, AWS Nitro tooling, and a clean nautilus checkout.

```bash
# On the EC2 host (or wherever you build EIFs):
cd ~/nautilus
~/shell/enclave-nitro/scripts/assemble.sh .   # re-apply overlay (idempotent)
make ENCLAVE_APP=shell                         # produces shell.eif

# Capture new PCRs printed at end of nitro-cli describe-eif
nitro-cli describe-eif --eif-path ./shell.eif
```

Note `PCR0`, `PCR1`, `PCR2` from the output.

## 3. Update PCRs on-chain

```bash
sui client call \
  --package <enclave-pkg-id> \
  --module enclave \
  --function update_pcrs \
  --args \
    0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504 \
    <new-PCR0> <new-PCR1> <new-PCR2> \
  --gas-budget 30000000
```

`ENCLAVE_KEY_SEED` is persistent → `Enclave<SHELL>` (`0xd002490d…`) does NOT need re-registration; pubkey stays `0x6fea82e8…`.

## 4. Restart enclave

```bash
# On EC2 host
sudo nitro-cli terminate-enclave --enclave-id $(nitro-cli describe-enclaves | jq -r '.[0].EnclaveID')
sudo nitro-cli run-enclave --eif-path ~/shell.eif --memory 4096 --cpu-count 2 --enclave-cid 16
```

Smoke check `/shell/status`:

```bash
curl -s https://sui.furqaannabi.com/shell/status | jq
# expect task-tick timestamps moving
```

## 5. SDK publish

User runs (passkey 2FA browser prompt):

```bash
cd /Users/a0000/projects/shell/ts-sdk
npm publish --access public
# expect: + @shell-finance/sdk@0.1.3
```

Verify:

```bash
npm view @shell-finance/sdk version    # 0.1.3
```

## 6. shell-agent bump + publish

Agent depends on `@shell-finance/sdk: ^0.1.0` → auto-resolves to 0.1.3, so the only change is republishing a new agent build with the upgraded lockfile.

```bash
cd /Users/a0000/projects/shell/shell-agent
npm install                            # picks up 0.1.3
npm version patch --no-git-tag-version # 0.1.4 → 0.1.5
npm publish --access public
```

## 7. E2E verification on testnet

Two-wallet good path:

```bash
# From any scratch dir with funded A + B keypairs
npx shell-agent post-ioi --side buy --asset 0x2::sui::SUI --... # A
npx shell-agent post-ioi --side sell ...                         # B
# expect: enclave matches → settle_v4 PTB → 2 SettlementReceipts
```

Self-match negative path:

```bash
# Same A wallet posts both sides
npx shell-agent post-ioi --side buy ...  # A
npx shell-agent post-ioi --side sell ... # A
# expect: enclave log "self-match IOI skipped"; no MatchProposed; no settle tx
# verify: sui client query-events --query MoveModule --module=ioi → 2 IoisPosted, 0 MatchProposed
```

Force on-chain abort (bypass enclave, prove Move guard):

```bash
# Build a settle_v4 PTB by hand with maker == taker and a fake instruction.
# Already covered by Move test settle_v4_rejects_self_match — that's the
# trustless guarantee; no need to repeat on testnet.
```

## 8. Sync docs

```bash
git add move/ ts-sdk/ enclave-nitro/ README.md docs/
git commit -m "Self-match prevention: ESelfMatch + settle_v4 + enclave skip + SDK throw"
git push
```

## Rollback

If anything regresses:

- Move: no easy rollback — `compatible` upgrade only adds abort paths. Worst case publish a `settle_v5` that re-omits the guard (don't do this — it permits wash).
- Enclave: revert mod.rs change, rebuild EIF, update PCRs again.
- SDK: `npm deprecate @shell-finance/sdk@0.1.3 "rollback"` then publish 0.1.4 reverting.
