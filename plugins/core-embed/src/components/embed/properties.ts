import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinitionInput } from "@checkout-studio/plugin-sdk"

import { PROVIDERS } from "./providers"

/**
 * docs/component-library.md § Embed.
 *
 * A provider and an id, not a URL. The control cannot offer a URL field
 * because the component cannot accept one — see providers.ts.
 *
 * The id's label and help change with the provider, because "Video ID" and
 * "Booking link" are different things and one field labelled "ID" would be a
 * field nobody can fill in without guessing. One property per provider, each
 * shown only for its own, which is what `showWhen` is for.
 */
const identifiers: PropertyDefinitionInput[] = Object.entries(PROVIDERS).map(
  ([value, provider]) => ({
    key: "id",
    target: "prop",
    label: provider.idLabel,
    group: "General",
    control: "text",
    help: provider.idHelp,
    showWhen: { key: "provider", equals: value },
  }),
)

export const embedProperties = defineProperties([
  {
    key: "provider",
    target: "prop",
    label: "Service",
    group: "General",
    control: "select",
    options: Object.entries(PROVIDERS).map(([value, provider]) => ({
      value,
      label: provider.label,
    })),
    help: "Only these four. A published checkout names every framed origin in its security policy.",
  },
  ...identifiers,
  {
    key: "title",
    target: "prop",
    label: "Title",
    group: "Accessibility",
    control: "text",
    help: "What a screen reader announces the frame as. Defaults to the service's name.",
  },
  {
    key: "aspectRatio",
    target: "style",
    label: "Aspect ratio",
    group: "Layout",
    control: "text",
    responsive: true,
  },
])
