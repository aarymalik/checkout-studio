import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { pageProperties } from "./components/page/properties"
import { sectionProperties } from "./components/section/properties"

/**
 * The editor half: property definitions, keyed by component type.
 *
 * Read by the inspector, which arrives in Phase 12. Nothing in the renderer's
 * module graph imports this file, and that is the point — a published checkout
 * has no use for the fact that Section's overflow control is a select with four
 * options, and no reason to download it.
 *
 * A map rather than an array because the one question anybody asks of it is
 * "what are the properties of the thing that is selected".
 */
export const coreLayoutProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["core.page", pageProperties],
  ["core.section", sectionProperties],
])
