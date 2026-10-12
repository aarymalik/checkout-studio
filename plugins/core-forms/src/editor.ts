import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { inputProperties } from "./components/input/properties"

/**
 * The editor half: property definitions, read by the inspector in Phase 12.
 *
 * Nothing in the renderer's module graph imports this. A customer paying on a
 * checkout has no use for the fact that a field's type control is a select
 * with five options.
 */
export const coreFormsProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["core.input", inputProperties],
])
