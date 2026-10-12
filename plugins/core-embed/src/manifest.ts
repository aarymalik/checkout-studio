import { pluginManifest, type PluginManifest } from "@checkout-studio/plugin-sdk"

/**
 * The embed plugin's manifest.
 *
 * Parsed rather than merely typed, like the other two: ours going through the
 * validation a third party's does is the only way we find out the contract
 * moved.
 */
export const manifest: PluginManifest = pluginManifest.parse({
  id: "core-embed",
  /* The `core` namespace, shared with `core-layout` and `core-content`. */
  namespace: "core",
  name: "Core Embed",
  version: "0.1.0",
  description: "HTML Block and Code Block.",
  author: "Checkout Studio",
  category: "components",
  compatibility: { minEngineVersion: "0.1.0", schemaVersion: "1.0.0" },
  permissions: [],
})
