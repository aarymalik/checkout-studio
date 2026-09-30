import { BREAKPOINTS, STATES } from "@checkout-studio/schema"
import type {
  Breakpoint,
  CheckoutTheme,
  Node,
  StyleProperties,
  StyleState,
} from "@checkout-studio/schema"
import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import type { ResolvedDeclarations, StyleFallback } from "./tokens"
import { resolveDeclarations } from "./tokens"

/**
 * The six-stage cascade.
 *
 * ```
 * 1. Theme defaults        the component's theme slot
 * 2. Component defaults    the component's own defaultStyles
 * 3. Node base styles
 * 4. Responsive overrides  desktop → tablet → mobile
 * 5. State overrides       hover, focus, active, disabled
 * 6. Visibility            handled by visibility/evaluate.ts
 * ```
 *
 * Later stages win, and no stage reorders. Stages 1 and 2 are a single flat
 * layer beneath the node, which is what reconciles the two rules
 * docs/phases.md asks for at once: "later stage overrides earlier" and
 * "component default used when no theme value". A theme slot has no
 * breakpoints, and neither does a component's defaults — a default that varied
 * by breakpoint would compete with the node's own overrides and the answer
 * would depend on which rule you read first.
 *
 * Stage 6 is not a style. A hidden node is not rendered at all, and a node
 * hidden only at one breakpoint becomes a `display` rule — never an omission,
 * because the HTML has to be identical at every width or hydration breaks.
 *
 * See docs/theme-system.md § Style Resolution.
 */

/**
 * Stage 1: the theme's values for this component type, as CSS.
 *
 * The slot's vocabulary belongs to the plugin that registered it — only the
 * core plugin knows what `variants.primary.background` means — so the mapping
 * is the plugin's `toStyles`. The plugin's registered `defaults` sit beneath
 * whatever the theme set, which is how a component keeps a coherent look in a
 * theme that has never heard of it.
 */
export function themeStyles(
  theme: CheckoutTheme,
  definition: ComponentDefinition | null,
  node: Node,
): StyleProperties {
  const slot = definition?.themeSlot

  if (slot === undefined || slot.toStyles === undefined) return {}

  return slot.toStyles(
    { ...slot.defaults, ...theme.components[(definition as ComponentDefinition).type] },
    node,
  )
}

/**
 * Stages 1 and 2, in order: the flat layer beneath every node style.
 *
 * A null definition means no component is registered for this node's type. Both
 * stages come from the definition, so both contribute nothing — but stages 3 to
 * 5 still apply, which is how the unsupported placeholder keeps the box the
 * node would have occupied. A live page that collapsed around a missing plugin
 * would spend the CLS budget on it.
 */
export function baseLayer(
  theme: CheckoutTheme,
  definition: ComponentDefinition | null,
  node: Node,
): StyleProperties {
  return { ...themeStyles(theme, definition, node), ...definition?.defaultStyles }
}

/** The breakpoints a value at `breakpoint` inherits through, widest first. */
export function inheritanceChain(breakpoint: Breakpoint): readonly Breakpoint[] {
  return BREAKPOINTS.slice(0, BREAKPOINTS.indexOf(breakpoint) + 1)
}

/**
 * Stages 3–5 for one breakpoint and one state.
 *
 * `base` is inherited by every state, and desktop is inherited by every
 * breakpoint. Both are single-direction: editing desktop changes the base and
 * therefore everything, and editing mobile writes an override affecting mobile
 * alone. Values cascade downward, never upward.
 */
export function layeredProperties(
  node: Node,
  breakpoint: Breakpoint,
  state: StyleState,
): StyleProperties {
  const chain = inheritanceChain(breakpoint)
  const merged: Record<string, StyleProperties[string]> = {}

  for (const step of chain) {
    Object.assign(merged, node.styles[step]?.base ?? {})
  }

  if (state !== "base") {
    for (const step of chain) {
      Object.assign(merged, node.styles[step]?.[state] ?? {})
    }
  }

  return merged
}

export interface ResolveOptions {
  theme: CheckoutTheme
  /** Null when no component is registered for the node's type. */
  definition: ComponentDefinition | null
  node: Node
  breakpoint: Breakpoint
  state: StyleState
}

/** All six stages, for one breakpoint and one state. */
export function resolveStyle(options: ResolveOptions): ResolvedDeclarations {
  const { theme, definition, node, breakpoint, state } = options
  const base = baseLayer(theme, definition, node)

  const properties: StyleProperties = {
    ...base,
    ...layeredProperties(node, breakpoint, state),
  }

  return resolveDeclarations(theme, properties, definition?.defaultStyles ?? {})
}

/** The states a node actually declares, in cascade order. `base` is always present. */
export function declaredStates(node: Node): readonly StyleState[] {
  return STATES.filter((state) => {
    if (state === "base") return true

    return BREAKPOINTS.some((breakpoint) => {
      const declared = node.styles[breakpoint]?.[state]

      return declared !== undefined && Object.keys(declared).length > 0
    })
  })
}

export interface ResolvedNodeStyles {
  /** Breakpoint → state → declarations. Narrow breakpoints hold only what differs. */
  blocks: Record<Breakpoint, Partial<Record<StyleState, Record<string, string>>>>
  fallbacks: readonly StyleFallback[]
}

/**
 * Every breakpoint and every state, with the narrow breakpoints reduced to
 * their differences from the one above.
 *
 * Published, static, and embed modes emit all three as media-query CSS, because
 * the server cannot know the visitor's viewport. Emitting the full resolved
 * block per breakpoint would work and would triple the stylesheet; emitting the
 * difference keeps it small without changing what the browser computes, since
 * the wider block is still in force.
 */
export function resolveAllStyles(
  theme: CheckoutTheme,
  definition: ComponentDefinition | null,
  node: Node,
): ResolvedNodeStyles {
  const states = declaredStates(node)
  const fallbacks: StyleFallback[] = []
  const blocks = {} as ResolvedNodeStyles["blocks"]
  const previous: Partial<Record<StyleState, Record<string, string>>> = {}

  for (const breakpoint of BREAKPOINTS) {
    const forBreakpoint: Partial<Record<StyleState, Record<string, string>>> = {}

    for (const state of states) {
      const resolved = resolveStyle({ theme, definition, node, breakpoint, state })

      // Only the first breakpoint's fallbacks are reported. The same
      // unresolvable reference at three widths is one problem, not three.
      if (breakpoint === "desktop") fallbacks.push(...resolved.fallbacks)

      const difference = changedFrom(previous[state] ?? {}, resolved.declarations)

      if (Object.keys(difference).length > 0) forBreakpoint[state] = difference
      previous[state] = resolved.declarations
    }

    blocks[breakpoint] = forBreakpoint
  }

  return { blocks, fallbacks }
}

/**
 * The entries of `next` that `previous` does not already say.
 *
 * Only ever adds. A resolved block at a narrow breakpoint holds every property
 * the wider one held, because both merge the same base layer — except where a
 * narrow override was unresolvable and the component had no default for it.
 * There the property keeps the wider breakpoint's value, which is the right
 * reading of "falls back": the cascade is what it falls back through, and CSS
 * has no way to un-set a declaration anyway.
 */
function changedFrom(
  previous: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
): Record<string, string> {
  const difference: Record<string, string> = {}

  for (const [property, value] of Object.entries(next)) {
    if (previous[property] !== value) difference[property] = value
  }

  return difference
}
