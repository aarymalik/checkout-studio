import { pluginManifest, type PluginManifest } from "@checkout-studio/plugin-sdk"

/**
 * The layout plugin's manifest.
 *
 * Parsed here rather than merely typed. A manifest is the one thing the host
 * reads before it trusts a plugin with anything, and ours going through the
 * same validation a third party's does is the only way we find out that the
 * contract moved.
 */
export const manifest: PluginManifest = pluginManifest.parse({
  id: "core-layout",
  /*
   * The `core` namespace, shared with `core-content` and `core-embed`.
   *
   * docs/component-library.md § Component Catalog: "The `core` namespace is
   * shared by the `core-*` plugins". Three packages cannot each derive `core`
   * from their own id, and the engine's own root node type is `core.page`, so
   * `core` was never one plugin's to own.
   */
  namespace: "core",
  name: "Core Layout",
  version: "0.1.0",
  description: "Section, Container, Grid, Stack, Columns, Spacer and Divider.",
  author: "Checkout Studio",
  category: "components",
  compatibility: { minEngineVersion: "0.1.0", schemaVersion: "1.0.0" },
  permissions: [],
})
