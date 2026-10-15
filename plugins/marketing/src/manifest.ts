import { pluginManifest, type PluginManifest } from "@checkout-studio/plugin-sdk"

/**
 * The marketing plugin's manifest.
 *
 * Its own namespace and its own package, because none of these components
 * knows what a cart is. A landing page built on this engine ships marketing
 * without checkout and loses nothing; a checkout ships without marketing and
 * loses nothing either.
 */

export const manifest: PluginManifest = pluginManifest.parse({
  id: "marketing",
  name: "Marketing",
  version: "0.1.0",
  description: "Countdown, Testimonial, FAQ, Logo Wall, Reviews, Progress Bar",
  author: "Checkout Studio",
  category: "components",
  compatibility: { minEngineVersion: "0.1.0", schemaVersion: "1.0.0" },
  permissions: [],
})
