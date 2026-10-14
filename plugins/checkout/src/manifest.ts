import { pluginManifest, type PluginManifest } from "@checkout-studio/plugin-sdk"

/**
 * The checkout plugin's manifest.
 *
 * Its own namespace rather than `core`: these are the components that make
 * this a checkout builder, and docs/component-library.md gives them
 * `checkout.*` type ids. A second product built on the same engine would ship
 * without this plugin and lose nothing it needs.
 */
export const manifest: PluginManifest = pluginManifest.parse({
  id: "checkout",
  name: "Checkout",
  version: "0.1.0",
  description: "The cart, the quote, and the components that show them.",
  author: "Checkout Studio",
  category: "checkout",
  compatibility: { minEngineVersion: "0.1.0", schemaVersion: "1.0.0" },
  permissions: [],
})
