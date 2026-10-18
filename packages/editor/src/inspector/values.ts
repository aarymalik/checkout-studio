import type { Breakpoint, Node, StyleState } from "@checkout-studio/schema"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

/**
 * What a node currently holds for the properties it registered.
 *
 * ## Two bags, one map
 *
 * A property writes to `props` or to `styles`, and the inspector shows them
 * side by side in the same section — a heading's text and its font size are
 * one list to the person editing. So the keys are flattened into one map here
 * and the target decides which bag a change goes back to.
 *
 * A prop and a style could in principle share a key. They do not: the SDK
 * refuses duplicate keys across a component's definitions, so one map is safe.
 *
 * ## The base, for now
 *
 * Styles are read from the base breakpoint and the base state. Editing a
 * tablet override is Phase 12's step 6 and needs an indicator, a reset and a
 * history entry of its own; reading one here without the rest would show a
 * value the panel could not explain.
 */

export const BASE_BREAKPOINT: Breakpoint = "desktop"
export const BASE_STATE: StyleState = "base"

export function valuesFor(
  node: Node,
  definitions: readonly PropertyDefinition[],
): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = {}
  const styles = node.styles[BASE_BREAKPOINT]?.[BASE_STATE] ?? {}

  for (const definition of definitions) {
    values[definition.key] =
      definition.target === "prop" ? node.props[definition.key] : styles[definition.key]
  }

  return values
}
