import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinitionInput } from "@checkout-studio/plugin-sdk"

import { ADDRESS_PARTS } from "./parts"

/**
 * docs/component-library.md § Address.
 *
 * A switch and a label per part, generated from the parts themselves so that
 * adding one cannot leave the inspector behind. The optional parts are the ones
 * worth switching off — a merchant selling downloads does not need a county —
 * and the required ones are offered too, because an address is not the same
 * shape everywhere and this is the only lever a merchant has until the
 * per-country work in a later phase.
 */
const perPart: PropertyDefinitionInput[] = ADDRESS_PARTS.flatMap((part) => [
  {
    key: `show${part.key}`,
    target: "prop" as const,
    label: `Ask for ${part.label.toLowerCase()}`,
    group: "General" as const,
    control: "toggle" as const,
  },
  {
    key: `label${part.key}`,
    target: "prop" as const,
    label: `${part.label} label`,
    group: "Advanced" as const,
    control: "text" as const,
    showWhen: { key: `show${part.key}`, not: false },
  },
])

export const addressProperties = defineProperties([
  {
    key: "required",
    target: "prop",
    label: "Required",
    group: "General",
    control: "toggle",
    help: "The optional parts stay optional either way.",
  },
  ...perPart,
  {
    key: "name",
    target: "prop",
    label: "Field name",
    group: "Advanced",
    control: "text",
    help: "Each part is saved under this and its own, such as address.city.",
  },
])
