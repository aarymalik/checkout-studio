import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { countdownProperties } from "./components/countdown/properties"
import { progressBarProperties } from "./components/progress-bar/properties"

/** The editor half: property definitions, read by the inspector in Phase 12. */
export const marketingProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["marketing.countdown", countdownProperties],
  ["marketing.progress-bar", progressBarProperties],
])
