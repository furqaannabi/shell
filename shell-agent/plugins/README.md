# Local plugins

Drop `.ts` or `.js` files here. Each file is auto-loaded at startup and registered alongside the built-in tools. This directory is gitignored — plugins stay local to your deployment.

## Minimal example

```ts
// plugins/my_oracle.ts
import type { Tool } from "../src/tools/registry.js";
import { z } from "zod";

const myOracle: Tool = {
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
