// One-shot helper: SUI -> DEEP (via DEEP_SUI helper pool, whitelisted)
// then SUI -> DBUSDC (via SUI_DBUSDC pool, uses the acquired DEEP for fees).
// All in a single PTB for atomicity.
//
// Usage:
//   AGENT_PRIVATE_KEY=$KEY SUI_FOR_DEEP=30000000 SUI_FOR_DBUSDC=50000000 \
//     node ./dist/acquire-dbusdc.js

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

import { config } from "./config.js";

const DEEPBOOK_PACKAGE_ID =
  "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
const SUI_DBUSDC_POOL =
  "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";
const DEEP_SUI_POOL =
  "0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f";
const DBUSDC_TYPE =
  "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC";
const DEEP_TYPE =
  "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP";
const SUI_TYPE = "0x2::sui::SUI";

async function main() {
  const keypair = Ed25519Keypair.fromSecretKey(config.agentPrivateKey);
  const sender = keypair.toSuiAddress();
  const suiForDeep = BigInt(process.env.SUI_FOR_DEEP ?? "30000000"); // 0.03 SUI
  const suiForDbusdc = BigInt(process.env.SUI_FOR_DBUSDC ?? "50000000"); // 0.05 SUI
  console.log(
    `[acquire-dbusdc] sender ${sender}, ${suiForDeep} MIST -> DEEP, ${suiForDbusdc} MIST -> DBUSDC`,
  );

  const suiClient = new SuiJsonRpcClient({
    url: config.suiRpcUrl,
    network: "testnet",
  });

  const tx = new Transaction();
  tx.setSender(sender);

  const [suiForDeepCoin, suiForDbusdcCoin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(suiForDeep),
    tx.pure.u64(suiForDbusdc),
  ]);

  // Leg 1: SUI -> DEEP via DEEP_SUI helper pool (whitelisted: deep_in=0 works)
  const zeroDeep = tx.moveCall({
    target: "0x2::coin::zero",
    typeArguments: [DEEP_TYPE],
  });
  const [deepFromHelper, suiLeftoverFromHelper, deepLeftoverFromHelper] =
    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::swap_exact_quote_for_base`,
      typeArguments: [DEEP_TYPE, SUI_TYPE],
      arguments: [
        tx.object(DEEP_SUI_POOL),
        suiForDeepCoin,
        zeroDeep,
        tx.pure.u64(0),
        tx.object("0x6"),
      ],
    });
  // Merge deep dust into the main DEEP coin
  tx.mergeCoins(deepFromHelper, [deepLeftoverFromHelper]);

  // Leg 2: SUI -> DBUSDC via SUI_DBUSDC pool (charges DEEP)
  const [suiLeftover2, dbusdcOut, deepLeftover2] = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::swap_exact_base_for_quote`,
    typeArguments: [SUI_TYPE, DBUSDC_TYPE],
    arguments: [
      tx.object(SUI_DBUSDC_POOL),
      suiForDbusdcCoin,
      deepFromHelper,
      tx.pure.u64(0),
      tx.object("0x6"),
    ],
  });

  tx.transferObjects(
    [
      dbusdcOut,
      suiLeftoverFromHelper,
      suiLeftover2,
      deepLeftover2,
    ],
    tx.pure.address(sender),
  );

  const built = await tx.build({ client: suiClient as never });
  const { signature } = await keypair.signTransaction(built);
  const res = await suiClient.executeTransactionBlock({
    transactionBlock: built,
    signature,
    options: { showEffects: true, showBalanceChanges: true },
  });
  console.log(`[acquire-dbusdc] tx: ${res.digest}`);
  console.log(`[acquire-dbusdc] status:`, res.effects?.status);
  for (const bc of res.balanceChanges ?? []) {
    console.log(`  ${bc.coinType}: ${bc.amount}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
