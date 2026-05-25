import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ToolRegistry } from "./registry.js";
import type { Tool } from "./registry.js";

const PLUGINS_DIR = resolve(process.cwd(), "plugins");

/** Auto-discover and register plugins from the `plugins/` directory.
 *  Each file must default-export a Tool or Tool[]. Registered as
 *  `plugin__<name>` to avoid collisions with built-ins. */
export async function loadPlugins(registry: ToolRegistry): Promise<void> {
  let entries: string[];
  try {
    entries = readdirSync(PLUGINS_DIR).filter((f) =>
      /\.(js|mjs)$/.test(f) && !f.startsWith("_"),
    );
    // Warn about .ts files — must be compiled to .js first
    const tsFiles = readdirSync(PLUGINS_DIR).filter((f) => f.endsWith(".ts") && !f.startsWith("_") && f !== "README.md");
    for (const f of tsFiles) {
      console.warn(`[plugins] ${f}: load error — Unknown file extension ".ts" for TypeScript plugins. Compile to .js/.mjs first, or run via tsx.`);
    }
  } catch {
    // plugins/ dir absent — normal for fresh installs
    return;
  }

  for (const file of entries) {
    const filePath = resolve(PLUGINS_DIR, file);
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const exported: unknown = mod.default;
      const tools: Tool[] = Array.isArray(exported) ? exported : [exported];
      for (const tool of tools) {
        if (!isValidTool(tool)) {
          console.warn(`[plugins] ${file}: default export missing required fields — skipped`);
          continue;
        }
        const namespaced: Tool = { ...tool, name: `plugin__${tool.name}` };
        registry.register(namespaced);
        console.log(`[plugins] registered plugin__${tool.name} (${file})`);
      }
    } catch (e) {
      console.warn(`[plugins] ${file}: load error — ${(e as Error).message}`);
    }
  }
}

function isValidTool(v: unknown): v is Tool {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.name === "string" &&
    typeof t.description === "string" &&
    typeof t.execute === "function" &&
    t.parameters != null
  );
}
