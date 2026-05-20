import { SealClient } from "@mysten/seal";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import {
  encryptOrder,
  submitOrderTx,
  type OrderPlaintext,
} from "@shell-finance/sdk";

import { config } from "./config.js";
import type { MatchProposal } from "./proposals.js";

/** Quote coin type — DUSDC on testnet (mirror of web/src/lib/sui.ts).
 *  DeepBook pool key happens to be SUI_DUSDC for legacy naming
 *  reasons; the actual quote coin traded in that pool is DUSDC. */
const QUOTE_COIN_TYPE =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

/** Build + submit a Shell sealed order matching the agent's side of a
 *  match proposal. For now uses the proposal's `agreedPrice` as the
 *  limit and `agreedSize` as the size; expiry = next epoch + 5. */
export async function submitOrderFromProposal(opts: {
  suiClient: SuiJsonRpcClient;
  sealClient: SealClient;
  keypair: Ed25519Keypair;
  proposal: MatchProposal;
}): Promise<string> {
  const { proposal } = opts;
  const sys = await opts.suiClient.getLatestSuiSystemState();
  const currentEpoch = BigInt(sys.epoch);
  const expiryEpoch = currentEpoch + 5n;

  const plaintext: OrderPlaintext = {
    side: proposal.side,
    size: proposal.agreedSize,
    limitPrice: proposal.agreedPrice,
    expiryEpoch,
    maxSlippageBps: 50,
  };

  const { sealedEnvelope, commitHash } = await encryptOrder({
    sealClient: opts.sealClient,
    shellPackageId: config.shellPackageId,
    threshold: 1,
    order: plaintext,
  });

  // Collateral coin: buy → quote (DUSDC), sell → base (SUI).
  // For demo simplicity, send minimal collateral (the enclave-matched
  // price + size implies these amounts).
  const isBuy = proposal.side === "buy";
  const collateralType = isBuy ? QUOTE_COIN_TYPE : "0x2::sui::SUI";
  const FLOAT_SCALING = 1_000_000_000n;
  // Required collateral derived from agreed_price (1e9-scaled) * agreed_size.
  const collateralAmount = isBuy
    ? (proposal.agreedSize * proposal.agreedPrice) / FLOAT_SCALING
    : proposal.agreedSize;

  const tx = new Transaction();
  let collateralArg;
  if (isBuy) {
    // Split DUSDC from the agent's USDC coin(s).
    const coins = await opts.suiClient.getCoins({
      owner: opts.keypair.toSuiAddress(),
      coinType: collateralType,
    });
    if (coins.data.length === 0) throw new Error("no DUSDC coin to use");
    const primary = tx.object(coins.data[0]!.coinObjectId);
    const [c] = tx.splitCoins(primary, [tx.pure.u64(collateralAmount)]);
    collateralArg = c!;
  } else {
    const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(collateralAmount)]);
    collateralArg = c!;
  }

  submitOrderTx({
    shellPackageId: config.shellPackageId,
    collateralType,
    collateral: collateralArg,
    sealedEnvelope,
    commitHash,
    expiryEpoch,
    tx,
  });

  const result = await opts.suiClient.signAndExecuteTransaction({
    signer: opts.keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  if (result.effects?.status?.status !== "success") {
    throw new Error(
      `submit_order failed: ${result.effects?.status?.error ?? "unknown"}`,
    );
  }
  return result.digest;
}
