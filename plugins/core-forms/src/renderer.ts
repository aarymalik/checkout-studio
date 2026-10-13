import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { manifest } from "./manifest"
import { FormProvider } from "./form/FormProvider"
import { input, textarea } from "./components/input/definition"
import { checkbox, radioGroup, select } from "./components/choice/definitions"

/**
 * The renderer half: the form context, and the fields that use it.
 *
 * The provider is registered under `forms`, which is the id the checkout
 * plugin will name in `dependsOn` so that it wraps the checkout provider —
 * docs/renderer.md § Context Providers. The engine sorts them; nothing here
 * knows what a checkout is.
 */
export const coreForms: Plugin = {
  manifest,
  activate(api: PluginApi) {
    api.registerProvider({ id: "forms", component: FormProvider })
    api.registerComponent(input)
    api.registerComponent(textarea)
    api.registerComponent(select)
    api.registerComponent(checkbox)
    api.registerComponent(radioGroup)
  },
}

export { checkbox, input, radioGroup, select, textarea }
