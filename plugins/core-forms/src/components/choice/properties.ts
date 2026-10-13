import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinitionInput } from "@checkout-studio/plugin-sdk"

import { COUNTRIES } from "./countries"

/**
 * The property definitions the choice fields share, and the ones they do not.
 *
 * docs/component-library.md § Select, Checkbox, Radio Group. The name sits in
 * Advanced for the reason Input's does: it is the key an answer is saved
 * under, and changing it renames a column in everything already collected.
 */
const label: PropertyDefinitionInput = {
  key: "label",
  target: "prop",
  label: "Label",
  group: "General",
  control: "text",
}

const help: PropertyDefinitionInput = {
  key: "help",
  target: "prop",
  label: "Help text",
  group: "General",
  control: "text",
}

const required: PropertyDefinitionInput = {
  key: "required",
  target: "prop",
  label: "Required",
  group: "General",
  control: "toggle",
}

const name: PropertyDefinitionInput = {
  key: "name",
  target: "prop",
  label: "Field name",
  group: "Advanced",
  control: "text",
  help: "The key this answer is saved under. Changing it renames the column in everything already collected.",
}

/**
 * The options, as one property.
 *
 * A list of value-and-label pairs rather than two parallel lists, because a
 * label can be reworded and a value cannot: they are different things, and a
 * control that edited them as one would quietly change saved answers when
 * somebody fixed a typo. The inspector's editor for this arrives in Phase 12.
 */
const options: PropertyDefinitionInput = {
  key: "options",
  target: "prop",
  label: "Options",
  group: "General",
  control: "text",
  help: "What this offers. The label can be reworded; the value is what is saved.",
}

export const selectProperties = defineProperties([
  label,
  options,
  {
    key: "placeholder",
    target: "prop",
    label: "Placeholder",
    group: "General",
    control: "text",
    help: "The first line, before anything is chosen.",
  },
  help,
  required,
  name,
])

export const checkboxProperties = defineProperties([label, help, required, name])

export const radioGroupProperties = defineProperties([label, options, help, required, name])

/**
 * Country's, which offer every country and store the chosen ones.
 *
 * The list is here rather than in the component because this file is the
 * editor's: a published checkout gets the countries the merchant picked, and
 * never the two hundred and fifty they did not.
 */
export const countryProperties = defineProperties([
  label,
  {
    key: "options",
    target: "prop",
    label: "Countries you ship to",
    group: "General",
    control: "select",
    options: [...COUNTRIES],
    help: "Only these are offered at checkout. A shorter list is a shorter list to read.",
  },
  help,
  required,
  name,
])
