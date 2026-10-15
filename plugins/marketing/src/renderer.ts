import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { countdown } from "./components/countdown/definition"
import { progressBar } from "./components/progress-bar/definition"
import { manifest } from "./manifest"

/**
 * The renderer half.
 *
 * Marketing components say things about an offer. None of them knows what is
 * in a cart or what anything costs — a page built on this engine that sells
 * nothing still wants a countdown and a row of logos, which is why they are
 * here rather than in the checkout plugin.
 */
export const marketing: Plugin = {
  manifest,
  activate(api: PluginApi) {
    api.registerComponent(countdown)
    api.registerComponent(progressBar)
  },
}

export { countdown, progressBar }
