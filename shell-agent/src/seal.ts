import { config } from "./config.js";

/** Seal key server config — picks testnet or mainnet based on AGENT_NETWORK.
 *  Override via SEAL_KEY_SERVER_OBJECT_ID + SEAL_KEY_SERVER_URL envs. */
export function sealKeyServer(): {
  objectId: string;
  aggregatorUrl: string;
  weight: number;
} {
  if (config.network === "mainnet") {
    return {
      objectId: process.env.SEAL_KEY_SERVER_OBJECT_ID ?? "0x0",
      aggregatorUrl: process.env.SEAL_KEY_SERVER_URL ?? "https://seal-aggregator-mainnet.mystenlabs.com",
      weight: 1,
    };
  }
  return {
    objectId:
      process.env.SEAL_KEY_SERVER_OBJECT_ID ??
      "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
    aggregatorUrl:
      process.env.SEAL_KEY_SERVER_URL ??
      "https://seal-aggregator-testnet.mystenlabs.com",
    weight: 1,
  };
}
