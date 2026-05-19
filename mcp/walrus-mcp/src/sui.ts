// Shared Sui + Walrus client wiring.
//
// SuiClient is always available (read-only tools work without keys).
// Keypair + WalrusClient are lazy and throw a clear error if the env
// isn't configured. Each is a per-process singleton.

import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { WalrusClient } from "@mysten/walrus";
import type { Config } from "./config.js";

let suiClientSingleton: SuiJsonRpcClient | null = null;
let keypairSingleton: Ed25519Keypair | null = null;
let walrusClientSingleton: WalrusClient | null = null;

export function getSuiClient(cfg: Config): SuiJsonRpcClient {
  if (suiClientSingleton) return suiClientSingleton;
  const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl(cfg.context);
  suiClientSingleton = new SuiJsonRpcClient({ url, network: cfg.context });
  return suiClientSingleton;
}

// Load a Sui keypair from `WALRUS_KEYPAIR_PATH`. Supported formats:
//   • a single bech32 `suiprivkey1...` string (as exported by `sui keytool`)
//   • a JSON array containing one such bech32 string (sui.keystore shape)
//
// The bech32 form is preferred because it self-describes the scheme.
export function getKeypair(_cfg: Config): Ed25519Keypair {
  if (keypairSingleton) return keypairSingleton;
  const path = process.env.WALRUS_KEYPAIR_PATH;
  if (!path) {
    throw new Error(
      "Set WALRUS_KEYPAIR_PATH to a file holding a `suiprivkey1...` bech32 string " +
        "(export one with `sui keytool export --key-identity <address>`).",
    );
  }
  const raw = readFileSync(path, "utf8").trim();
  let bech32: string;
  if (raw.startsWith("suiprivkey1")) {
    bech32 = raw;
  } else if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string") {
      throw new Error("WALRUS_KEYPAIR_PATH: expected JSON array of suiprivkey strings");
    }
    bech32 = parsed[0];
  } else {
    throw new Error(
      "WALRUS_KEYPAIR_PATH: file must hold a bech32 `suiprivkey1...` string or a JSON array of one",
    );
  }
  const { scheme, secretKey } = decodeSuiPrivateKey(bech32);
  if (scheme !== "ED25519") {
    throw new Error(`WALRUS_KEYPAIR_PATH: only ED25519 supported, got ${scheme}`);
  }
  keypairSingleton = Ed25519Keypair.fromSecretKey(secretKey);
  return keypairSingleton;
}

export function getWalrusClient(cfg: Config): WalrusClient {
  if (walrusClientSingleton) return walrusClientSingleton;
  const sui = getSuiClient(cfg);
  walrusClientSingleton = new WalrusClient({
    network: cfg.context,
    suiClient: sui as any,
  });
  return walrusClientSingleton;
}
