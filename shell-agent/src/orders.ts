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

const SUI_TYPE = "0x2::sui::SUI";

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

  // Collateral: buy → quote coin, sell → base coin.
  const isBuy = proposal.side === "buy";
  const collateralType = isBuy ? config.quoteCoinType : config.baseCoinType;
  const floatScaling = BigInt(10 ** config.baseDecimals);
  const collateralAmount = isBuy
    ? (proposal.agreedSize * proposal.agreedPrice) / floatScaling
    : proposal.agreedSize;

  const tx = new Transaction();
  let collateralArg;
  if (!isBuy && collateralType === SUI_TYPE) {
    const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(collateralAmount)]);
    collateralArg = c!;
  } else {
    const coins = await opts.suiClient.getCoins({
      owner: opts.keypair.toSuiAddress(),
      coinType: collateralType,
    });
    if (coins.data.length === 0) {
      const sym = collateralType.split("::").pop() ?? collateralType;
      throw new Error(`no ${sym} coin in wallet to use as collateral`);
    }
    const primary = tx.object(coins.data[0]!.coinObjectId);
    if (coins.data.length > 1) {
      tx.mergeCoins(primary, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    const [c] = tx.splitCoins(primary, [tx.pure.u64(collateralAmount)]);
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
