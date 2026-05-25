# Local plugins

Drop `.js` or `.mjs` files here. Each file is auto-loaded at startup and registered alongside the built-in tools. This directory is gitignored — plugins stay local to your deployment.

> **Note:** Plugins must be plain JavaScript (`.js`/`.mjs`). TypeScript (`.ts`) files cannot be imported directly at runtime by Node.js. If you write a plugin in TypeScript, compile it first (`tsc --outDir plugins/ plugins/my_plugin.ts`) or copy `sample.mjs` as a starting point.

## Minimal example

```js
// plugins/my_oracle.mjs
import { z } from "zod";

const myOracle = {
  name: "my_oracle",
  description: "Returns my custom SUI/USDC fair value from an internal feed.",
  parameters: z.object({}),
  async execute() {
    const res = await fetch("https://my-oracle.example.com/sui-usdc");
    return await res.json();
  },
};

export default myOracle;
```

The plugin is registered as `plugin__my_oracle` (prefix prevents name collisions with built-ins).

See `sample.mjs` in this directory for a working two-tool example.

## ToolCtx

Your `execute` function receives a second `ctx` argument:

```ts
async execute(args, ctx) {
  // ctx.suiClient   — SuiJsonRpcClient (reads chain state)
  // ctx.sealClient  — SealClient (encrypt/decrypt via Seal)
  // ctx.keypair     — Ed25519Keypair (sign transactions)
  // ctx.address     — string (agent's Sui address)
}
```

## Security note

Plugins run in-process with full agent privileges (wallet access, network access, chain writes). Only load code you trust.
