import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { inputProperties, textareaProperties } from "./components/input/properties"
import {
  checkboxProperties,
  countryProperties,
  radioGroupProperties,
  selectProperties,
} from "./components/choice/properties"
import { addressProperties } from "./components/address/properties"

/**
 * The editor half: property definitions, read by the inspector in Phase 12.
 *
 * Nothing in the renderer's module graph imports this. A customer paying on a
 * checkout has no use for the fact that a field's type control is a select
 * with five options.
 */
export { COUNTRIES } from "./components/choice/countries"

export const coreFormsProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["core.input", inputProperties],
  ["core.textarea", textareaProperties],
  ["core.select", selectProperties],
  ["core.checkbox", checkboxProperties],
  ["core.radio-group", radioGroupProperties],
  ["core.country", countryProperties],
  ["core.address", addressProperties],
])
