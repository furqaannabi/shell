// Smoke check: settleMatchTx must throw when maker === taker.
// Run: `npm run build && node scripts/self-match-smoke.mjs`
// Exits non-zero on failure.

import { settleMatchTx } from "../dist/index.js";

const ADDR = "0xa1ec7fc05d20dbdfa5d8de27c2d8c5b86bd9b1ff3fb20e3e0e3a0e3a0e3a0e3a";

const opts = {
  shellPackageId: "0x1",
  poolId: "0x2",
  enclaveId: "0x3",
  timestampMs: 1n,
  maker: ADDR,
  taker: ADDR,
  makerOrderId: "0x4",
  takerOrderId: "0x5",
  makerCollateralType: "0x2::sui::SUI",
  takerCollateralType: "0x2::sui::SUI",
  filledSize: 1n,
  filledPrice: 1n,
  baseDecimals: 9,
  deepbookTxDigest: new Uint8Array(32),
  signature: new Uint8Array(64),
};

let threw = false;
try {
  settleMatchTx(opts);
} catch (err) {
  threw = true;
  if (!/self-match/i.test(err.message)) {
    console.error(`FAIL: threw but message did not mention self-match: ${err.message}`);
    process.exit(1);
  }
  console.log(`PASS: settleMatchTx threw: ${err.message}`);
}

if (!threw) {
  console.error("FAIL: settleMatchTx did not throw on maker === taker");
  process.exit(1);
}

// Sanity: distinct addresses must NOT throw the self-match error.
const ADDR_B = "0xb1ec7fc05d20dbdfa5d8de27c2d8c5b86bd9b1ff3fb20e3e0e3a0e3a0e3a0e3b";
try {
  settleMatchTx({ ...opts, taker: ADDR_B });
  console.log("PASS: distinct maker/taker accepted");
} catch (err) {
  if (/self-match/i.test(err.message)) {
    console.error(`FAIL: self-match thrown on distinct addresses: ${err.message}`);
    process.exit(1);
  }
  // Other errors (e.g. transaction builder internals) are fine for this smoke.
  console.log(`PASS: distinct maker/taker accepted (downstream error: ${err.message})`);
}
