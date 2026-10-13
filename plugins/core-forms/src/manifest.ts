import { pluginManifest, type PluginManifest } from "@checkout-studio/plugin-sdk"

/**
 * The forms plugin's manifest.
 *
 * The `core` namespace, shared with the other `core-*` plugins, and parsed
 * rather than merely typed for the reason the others are: ours going through
 * the validation a third party's does is the only way we find out the contract
 * moved.
 */
export const manifest: PluginManifest = pluginManifest.parse({
  id: "core-forms",
  namespace: "core",
  name: "Core Forms",
  version: "0.1.0",
  description: "The form a checkout's fields share, and every field.",
  author: "Checkout Studio",
  category: "components",
  compatibility: { minEngineVersion: "0.1.0", schemaVersion: "1.0.0" },
  permissions: [],
})
