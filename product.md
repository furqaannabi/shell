
**TECHNICAL SPECIFICATION · v0.1 · CONFIDENTIAL**

**Shell Finance**

_Confidential order flow on DeepBook · Sui Overflow 2026 · DeFi & Payments track_

| **Project**   | **Track**              | **Team size** | **Build window** |
| ------------- | ---------------------- | ------------- | ---------------- |
| Shell Finance | DeFi & Payments (Core) | 2 engineers   | 6-8 weeks        |

# **1\. Executive Summary**

Shell Finance is the first true on-chain dark pool: a confidential order flow layer for DeepBook where institutional traders submit Seal-encrypted orders, a Nautilus TEE matches and clears them against DeepBook's CLOB, and only post-execution receipts are revealed. The result is MEV-resistant, front-running-resistant institutional execution that retains full on-chain auditability - a combination no chain other than Sui can deliver today.

### **The wedge**

- DeepBook is the only fully on-chain CLOB with shared liquidity and sub-second finality.
- Seal provides threshold encryption with Move-policy access control - orders stay sealed until matched.
- Nautilus provides verifiable off-chain compute in AWS Nitro Enclaves, with on-chain PCR registration.
- The composition of these three is technically possible only on Sui, and no team has shipped it.

### **Why now**

- Sui Overflow 2026 has no standalone Privacy track. DeFi judges will reward novel privacy compositions because there is no other bucket for them.
- Shroud (3rd place Privacy 2025) proved that privacy-DEX wins. Shroud was AMM-based; CLOB dark pools are the unsolved version.
- Hashi mainnet (BTC primitives), x402 V2 with Sui settlement, and Mysten's institutional-DeFi narrative are all converging on Q3 2026 - Shell sits squarely in that thesis.

### **Status**

Spec only. Spike target: end-to-end demonstration of one Seal-encrypted order matched in a Nautilus enclave and settled on DeepBook testnet within 48 hours of build start. If that spike succeeds, the project is Go. If it fails, the team pivots to HashiPay (alt #1) without losing infrastructure investment.

# **2\. Problem**

## **2.1 Institutional execution on public chains is a leak**

Every public order book - including DeepBook - exposes order intent before execution. For retail flow this is acceptable. For institutional size it is a tax: searchers front-run, market makers fade quotes, and large orders cannot be worked without significant slippage. On centralized venues, dark pools and RFQ desks solve this. On-chain, no equivalent exists.

## **2.2 Existing on-chain privacy attempts have structural limits**

- **Stealth-address payment** (PIVY, Umbra) hides recipients but not order flow.
- **Privacy AMMs** (Shroud, Penumbra) hide swaps but suffer constant-product slippage and cannot serve institutional size.
- **ZK rollups** (Aztec, Aleo) provide privacy but lose access to the host chain's liquidity.
- **Off-chain dark pools** (sFOX, ErisX) require trust in a single operator and have no settlement guarantee.

## **2.3 The unsolved problem**

An institutional venue needs four properties simultaneously: pre-trade order privacy, post-trade auditability, settlement against the deepest available liquidity, and zero operator trust. No chain has previously had the primitives to deliver all four.

# **3\. Solution**

Shell Finance composes three Sui-native primitives into a single institutional execution venue:

| **Layer**    | **Function**                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Seal**     | Threshold-encrypts the order envelope with a Move-policy access rule. Decryption keys are released only when the policy fires - i.e. when the enclave's PCR matches and the matching window opens.                        |
| **Nautilus** | AWS Nitro Enclave (or Marlin Oyster) runs the matching engine. The enclave's PCR measurements are registered on-chain via Move; only that exact binary can request decryption keys. Output is a signed match instruction. |
| **DeepBook** | Receives the signed match instruction as a single PTB. Move-side verifies the enclave attestation, then settles via DeepBook v3 spot or margin. Trade hits the public book post-execution as a fait accompli.             |

## **3.1 The user flow**

- Trader signs into Shell via zkLogin or wallet.
- Trader submits order: side, size, limit price, expiry, max slippage.
- Client encrypts the order under Seal with a policy of the form: "this key may be released only to a TEE whose PCR matches X, during epoch Y."
- Sealed envelope is published to the Shell shared object on Sui as an OrderCommitment.
- Nautilus enclave watches for new commitments, requests decryption from Seal key servers (which verify the enclave's attestation), pulls the orders into private memory.
- Enclave runs the matching algorithm against (a) other sealed orders in the same window and (b) DeepBook's public book, computes optimal fills, and signs a match instruction.
- Settlement PTB lands on Sui: Move verifies the enclave signature against the registered PCR, executes DeepBook trades, mints a settlement receipt object owned by the trader.
- Receipt is publicly auditable; the original sealed order remains encrypted forever.

## **3.2 What's revealed, what isn't**

| **Stage**           | **Public**                                         | **Private**                           |
| ------------------- | -------------------------------------------------- | ------------------------------------- |
| **Pre-match**       | Order exists, trader address, expiry epoch         | Side, size, limit price, slippage     |
| **Match**           | Match happened, enclave signed it                  | Counterparty identity (until receipt) |
| **Post-settlement** | Filled price, size, both parties, DeepBook tx hash | Original limit, original max slippage |

# **4\. Architecture**

## **4.1 System diagram**

┌─────────────────────────────────────────────┐

│ CLIENT (TS) │

│ · Order builder · Seal encrypt · Sign PTB │

└──────────────────────┬──────────────────────┘

│ sealed OrderCommit

▼

┌──────────────────────────────────────────────────────────────────┐

│ SUI MAINNET │

│ ┌──────────────┐ ┌────────────────┐ ┌─────────────────────┐ │

│ │ shell::pool │──▶│ seal::policy │ │ deepbook::v3::pool │ │

│ │ (orders, │ │ (PCR-gated │ │ (settlement venue) │ │

│ │ receipts) │ │ decryption) │ │ │ │

│ └──────┬───────┘ └────────┬───────┘ └──────────┬──────────┘ │

└─────────┼────────────────────┼──────────────────────┼────────────┘

│ watch │ key request ▲ settle

▼ ▼ │

┌─────────────────────────────────────────┐ │

│ NAUTILUS ENCLAVE (AWS Nitro) │ │

│ · Decrypt orders · Match engine │───────────┘

│ · Sign match instr · Attestation │ signed PTB

│ · Pyth oracle · DeepBook depth │

└─────────────────────────────────────────┘

## **4.2 On-chain modules (Move)**

### **shell::pool**

The core shared object holding open order commitments and the registered enclave PCR set.

module shell::pool {

public struct Pool has key {

id: UID,

registered_pcrs: VecSet&lt;vector<u8&gt;>, // approved enclave measurements

epoch_window_ms: u64, // matching window length

protocol_fee_bps: u64,

treasury: address,

}

public struct OrderCommitment has key, store {

id: UID,

trader: address,

sealed_envelope: vector&lt;u8&gt;, // Seal ciphertext

commit_hash: vector&lt;u8&gt;, // SHA256 of plaintext

collateral: Balance&lt;T&gt;, // generic collateral

expiry_epoch: u64,

}

public struct SettlementReceipt has key, store {

id: UID,

trader: address,

counterparty: address,

filled_size: u64,

filled_price: u64,

deepbook_tx_digest: vector&lt;u8&gt;,

enclave_signature: vector&lt;u8&gt;,

}

}

### **shell::attestation**

Verifies Nautilus enclave signatures against the registered PCR set before allowing settlement.

module shell::attestation {

/// Verify a Nautilus attestation document and signature.

/// Aborts if PCR is not in registered_pcrs or signature is invalid.

public fun verify_match_instruction(

pool: &Pool,

attestation_doc: vector&lt;u8&gt;,

signature: vector&lt;u8&gt;,

match_payload: vector&lt;u8&gt;,

): MatchInstruction { /\* ... \*/ }

}

### **shell::settlement**

Hot-potato pattern: the MatchInstruction must be consumed within the same PTB as DeepBook trades, and a SettlementReceipt must be minted before the PTB ends. This prevents the enclave from signing settlements that never reach DeepBook.

## **4.3 Off-chain components**

### **Encryption client (TypeScript)**

- Wraps @mysten/seal SDK.
- Builds Seal IBE policies of the form: PCR equals X AND timestamp lies in \[epoch_open, epoch_close\].
- Encrypts order, computes commit hash, builds the OrderCommitment PTB, signs and submits.
- Published as @shell-finance/sdk on npm.

### **Matching enclave (Rust)**

- Runs in AWS Nitro Enclave, built reproducibly via Marlin Oyster's reproducible-build template.
- Watches Sui RPC for new OrderCommitment events on the Shell pool.
- Requests decryption keys from Seal key servers - Seal verifies the enclave's attestation against the policy.
- Runs a price-time-priority matching algorithm; cross-checks against DeepBook depth via Pyth oracle for fair-mid.
- Signs a match instruction (Ed25519 key generated inside the enclave; pubkey published on-chain at deployment).
- Submits the settlement PTB on behalf of users, paying gas via Enoki sponsored transactions.

### **Operator console**

- Next.js + @mysten/dapp-kit.
- Trader view: place orders, view sealed receipts, withdraw fills.
- Admin view: PCR registry management, enclave health, fee withdrawal.
- Public view: aggregated volume, fill quality vs. DeepBook, time-to-match histograms.

# **5\. Threat Model**

| **Adversary**                  | **Capability**                                         | **Mitigation**                                                                                                                  |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Searcher / MEV bot**         | Reads Sui mempool, attempts to front-run               | Order content is sealed; only commitment hash is visible. Mempool sees ciphertext.                                              |
| **Shell operator**             | Runs the enclave, controls infra                       | Cannot extract plaintext: enclave attestation gates Seal decryption. Cannot rewrite matches: Move verifies enclave signature.   |
| **Malicious enclave operator** | Replaces enclave binary, attempts to leak orders       | PCR mismatch - Seal refuses key release. Match signatures verified against registered PCR.                                      |
| **Malicious counterparty**     | Submits orders to learn other orders' prices           | Counterparty only sees fills they were matched against, after settlement. Aggregate flow is published with delay.               |
| **Seal key server set**        | Threshold-collude to leak keys                         | Threshold (t-of-n) is the trust assumption - same as inherited by all Seal users. Documented as a known limit.                  |
| **AWS / cloud provider**       | Compromises Nitro hardware, exfiltrates enclave memory | TEE side-channel attacks are real; pitched as transparency layer, not absolute security. Marlin Oyster diversification roadmap. |

### **What we explicitly do NOT defend against**

- Coordinated collusion between (Shell operator + Seal key servers + AWS) - this is the irreducible trust set.
- Coercion of the trader by the matching counterparty post-settlement (out of scope).
- Statistical inference from publicly aggregated volume over long time horizons.

_These are honest limitations, called out in the pitch. Mysten judges have explicitly rewarded teams that are upfront about TEE caveats rather than overselling them._

# **6\. Build Plan**

## **6.1 Eight-week timeline**

| **Week** | **Furqaan (Move + TEE + AWS)**                                                                        | **Co-founder (TS SDK + frontend)**                                       |
| -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **0**    | 48-hour spike: Seal encrypt → Nautilus decrypt → DeepBook test trade. GO/NO-GO gate.                  | Spike: order builder UI, signs and submits one OrderCommitment PTB.      |
| **1**    | shell::pool + shell::attestation Move modules. Unit tests with sui move test.                         | @shell-finance/sdk skeleton, Seal policy builder, npm publish 0.0.1.     |
| **2**    | Nautilus enclave Rust skeleton. Reproducible build via Marlin Oyster. PCR registry on devnet.         | Operator console scaffold (Next.js, dapp-kit, Tailwind).                 |
| **3**    | Matching engine v1: price-time-priority, sealed orders only (no DeepBook integration yet).            | Trader view: place + cancel + view sealed receipts.                      |
| **4**    | DeepBook v3 integration: enclave queries depth, builds settlement PTB.                                | Public stats view, fill-quality charts, time-to-match histograms.        |
| **5**    | End-to-end testnet flow. Stress test with 1000 simulated orders.                                      | Enoki sponsored transactions, zkLogin integration for trader onboarding. |
| **6**    | Mainnet deployment dry run. Failure-mode handling: stale orders, enclave restart, key-server timeout. | Demo flow polish. Recording rig setup.                                   |
| **7**    | Audit support: OtterSec / OpenZeppelin sponsor bounty submission. Security writeup.                   | 3-minute demo video. Twitter thread. Submission packet.                  |
| **8**    | Buffer / overflow week. Final mainnet deploy.                                                         | Pitch deck. Submit to DeepSurge.                                         |

## **6.2 The 48-hour spike (Week 0)**

The single most important decision is whether the Seal + Nautilus + DeepBook composition actually works end-to-end. Spike scope:

- Stand up a Nautilus enclave on AWS Nitro using Marlin Oyster's reference build.
- Register the enclave's PCR on Sui devnet via a minimal Move module.
- From a TS client, encrypt a hardcoded order under Seal with a PCR-gated policy.
- Have the enclave fetch the ciphertext, decrypt via Seal key servers, log the plaintext.
- Have the enclave sign a hardcoded DeepBook trade and submit it via PTB. Verify it lands.

**GO criteria:** all five steps work in <60s end-to-end. **NO-GO:** pivot to HashiPay (alt #1 from idea ranking). Same Move + Nautilus + AWS infra is reusable; no time wasted.

## **6.3 Risk register**

| **Risk**                                     | **Likelihood** | **Mitigation**                                                                         |
| -------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| Seal key-server latency >1s breaks UX        | **Medium**     | Batch matching window of 5-15s - latency is amortized; documented as feature, not bug. |
| Nautilus reproducible-build fragility        | **Medium**     | Use Marlin Oyster's hosted enclave service to abstract Nitro complexity.               |
| DeepBook v3 SDK breaking changes             | **Low**        | Pin SDK version. Mysten gives 2-week deprecation windows.                              |
| Mysten ships its own confidential-orders SDK | **Low**        | Pivot to being the institutional UX layer on top of their SDK.                         |
| TEE side-channel disclosure mid-build        | **Low**        | Pre-empt in pitch: Shell is a transparency layer, not a confidentiality fortress.      |
| Live demo fails                              | **Medium**     | Pre-record demo video Day -3 of submission. Backup plays if live breaks.               |

# **7\. Judging Strategy**

## **7.1 What Mysten judges actually score**

- Working demo (highest weight). A 90-second flow showing trader → sealed order → match → settlement.
- Sui-native primitive composition. Shell uses four: Seal, Nautilus, DeepBook, sponsored tx.
- Engineering quality. Public GitHub, clean Move, reproducible enclave build, README that runs.
- Founder signal. ETH Global, QuickNode hackathon win, prior shipped projects on slide 1.
- Distribution narrative. Who is the first 10 institutional users and why do they sign Monday?

## **7.2 The one-line pitch**

_"The first true on-chain dark pool: institutional execution privacy with cryptographic guarantees, settled on DeepBook."_

## **7.3 The ten-slide deck**

- Cover. Shell Finance. One line. Team.
- Problem. Order leak costs institutions basis points; existing solutions are partial.
- Why Sui. The Seal + Nautilus + DeepBook composition exists nowhere else.
- Architecture diagram. The system flow from section 4.1.
- Demo. 90-second video embedded.
- What's revealed / private. The table from section 3.2.
- Threat model. Honest. Section 5.
- Distribution. Three institutional design partners contacted; LOIs target.
- Team. ETH Global, QuickNode winner, AWS Nitro depth, full-stack web3.
- Ask. Win the DeFi & Payments track. Next: Mysten Moonshot grant.

## **7.4 Sponsor bounty stack**

- OtterSec or OpenZeppelin (Infra & DevX): security writeup + audit credit ask.
- Walrus: archive sealed-order ciphertexts to Walrus for permanent encrypted retention.
- Pyth: oracle for fair-mid reference in matching engine.
- Enoki / Mysten: zkLogin + sponsored tx for trader onboarding.

_Realistic bounty stacking: 2-4 sponsor prizes on top of the main-track win._

# **8\. Post-Hackathon Path**

Shell Finance is designed to be fundable, not just demoable. The progression after Overflow:

### **Immediately post-submission**

- Apply for Mysten Moonshot grant (track winners get fast-tracked).
- Approach 5-10 Sui-native trading firms (e.g. Wintermute, Flowdesk, Auros) for design-partner LOIs.
- Open-source the SDK; keep the matching engine and operator console proprietary.

### **Three months out**

- Mainnet alpha with 2-3 design partners trading sub-\$10M flow.
- Pre-seed conversations: Sui ecosystem funds (Sui Foundation, Mysten Ventures), institutional-DeFi funds (1kx, Standard Crypto, Arrington).
- Add DeepBook Margin support - leveraged dark-pool trades are a unique product.

### **Twelve months out**

- Cross-venue routing: enclave matches across DeepBook, Cetus, Aftermath simultaneously.
- RFQ mode: market makers stream quotes encrypted, takers settle privately.
- Compliance layer: optional ERC-3643-style allowlist for regulated counterparties.

# **Appendix A. Open Questions**

- Should the matching window be deterministic (every 10s) or adaptive (filled when N orders pool)?
- How is collateral handled for multi-leg orders that may partially fill across windows?
- Does the operator run a single enclave or a quorum of enclaves with cross-attestation?
- Fee model: maker rebate / taker fee in DeepBook style, or flat bps on filled notional?
- How are stale orders (post-expiry) collateral-released without operator action?

# **Appendix B. Glossary**

| **Term**          | **Definition**                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Seal**          | Mysten's threshold-encryption protocol with Move-policy access control. Allows on-chain rules to gate decryption.          |
| **Nautilus**      | Sui's verifiable off-chain compute primitive using AWS Nitro Enclaves. PCR measurements registered on-chain.               |
| **DeepBook v3**   | Sui's shared on-chain CLOB. v3 adds Margin and Predict modules.                                                            |
| **PCR**           | Platform Configuration Register - cryptographic measurement of an enclave binary used as its identity.                     |
| **PTB**           | Programmable Transaction Block. Sui's atomic multi-call transaction primitive.                                             |
| **Hot potato**    | Move pattern for objects without store ability - must be consumed in the same transaction. Used here for MatchInstruction. |
| **Marlin Oyster** | Hosted reproducible-build enclave service that integrates with Nautilus on Sui mainnet.                                    |

_- end of specification -_
