import type { Breakpoint, Node, StyleState } from "@checkout-studio/schema"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { effectiveSides, formatSides, shapesOf } from "./sides"

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
 * ## What the panel shows is what is in effect
 *
 * A component's own defaults are stage two of the cascade, and most values
 * come from there rather than from the node — a freshly inserted Section has
 * no styles of its own at all. Reading only the node showed an empty panel
 * beside a canvas that plainly had padding on it, which reads as the control
 * being broken rather than as the value being inherited.
 *
 * ## The base, for now
 *
 * Styles are read from the base breakpoint and the base state. Editing a
 * tablet override is Phase 12's step 6 and needs an indicator, a reset and a
 * history entry of its own; reading one here without the rest would show a
 * value the panel could not explain.
 */

/** A component's own defaults: stage two of the cascade. */
export interface Defaults {
  props?: Readonly<Record<string, unknown>>
  styles?: Readonly<Record<string, unknown>>
}

export const BASE_BREAKPOINT: Breakpoint = "desktop"
export const BASE_STATE: StyleState = "base"

export function valuesFor(
  node: Node,
  definitions: readonly PropertyDefinition[],
  defaults: Defaults = {},
): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = {}
  const styles = node.styles[BASE_BREAKPOINT]?.[BASE_STATE] ?? {}

  for (const definition of definitions) {
    if (definition.target === "prop") {
      values[definition.key] = node.props[definition.key] ?? defaults.props?.[definition.key]

      continue
    }

    /*
     * A side property is assembled from whichever shape set it, because both
     * exist: a Section ships four `paddingTop`-style defaults while other
     * components ship one `padding`. Reading only the shorthand showed empty
     * boxes for half the library.
     */
    if (definition.control === "spacing" || definition.control === "radius") {
      values[definition.key] = formatSides(
        effectiveSides(definition.key, styles, defaults.styles ?? {}),
      )

      continue
    }

    values[definition.key] = styles[definition.key] ?? defaults.styles?.[definition.key]
  }

  return values
}

/**
 * The properties this node holds itself, rather than inherits.
 *
 * What the inspector's reset is offered for, and the only thing that
 * distinguishes "24px because somebody typed it" from "24px because the
 * component ships it" — `valuesFor` deliberately collapses the two, since what
 * a panel shows is what is in effect.
 *
 * Read with exactly the rules `valuesFor` reads by, including the one that
 * matters most here: a side counts as held when *any* of its shapes is
 * present. A node with only `paddingLeft` of its own has overridden its
 * padding, and a reset that did not offer itself there would strand the one
 * side somebody changed.
 */
export function ownKeys(
  node: Node,
  definitions: readonly PropertyDefinition[],
): ReadonlySet<string> {
  const held = new Set<string>()
  const styles = node.styles[BASE_BREAKPOINT]?.[BASE_STATE] ?? {}

  for (const definition of definitions) {
    const bag: Readonly<Record<string, unknown>> =
      definition.target === "prop" ? node.props : styles

    const keys =
      definition.control === "spacing" || definition.control === "radius"
        ? shapesOf(definition.key)
        : [definition.key]

    if (keys.some((key) => bag[key] !== undefined)) held.add(definition.key)
  }

  return held
}
