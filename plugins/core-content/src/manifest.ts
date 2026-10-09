import { pluginManifest, type PluginManifest } from "@checkout-studio/plugin-sdk"

/**
 * The content plugin's manifest.
 *
 * Parsed here rather than merely typed, like `core-layout`'s: a manifest is the
 * one thing the host reads before it trusts a plugin with anything, and ours
 * going through the same validation a third party's does is the only way we
 * find out that the contract moved.
 */
export const manifest: PluginManifest = pluginManifest.parse({
  id: "core-content",
  /*
   * The `core` namespace, shared with `core-layout` and `core-embed`.
   *
   * docs/component-library.md § Component Catalog: "The `core` namespace is
   * shared by the `core-*` plugins". A duplicate type id is still refused, so
   * sharing a namespace lets this plugin add to it and never replace within it
   * — there is a test for that in plugin-sdk.
   */
  namespace: "core",
  name: "Core Content",
  version: "0.1.0",
  description: "Heading, Text, Badge, Image, Video, Icon, Button and Link.",
  author: "Checkout Studio",
  category: "components",
  compatibility: { minEngineVersion: "0.1.0", schemaVersion: "1.0.0" },
  permissions: [],
})
