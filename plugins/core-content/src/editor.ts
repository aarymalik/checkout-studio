import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { badgeProperties } from "./components/badge/properties"
import { headingProperties } from "./components/heading/properties"
import { textProperties } from "./components/text/properties"

/**
 * The editor half: property definitions, keyed by component type.
 *
 * Read by the inspector, which arrives in Phase 12. Nothing in the renderer's
 * module graph imports this file — a customer paying on a checkout has no use
 * for the fact that a heading's weight control is a select with four options.
 */
export const coreContentProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["core.heading", headingProperties],
  ["core.text", textProperties],
  ["core.badge", badgeProperties],
])
