import { BREAKPOINTS } from "@checkout-studio/schema"
import type { Breakpoint, StyleState } from "@checkout-studio/schema"

import { ROOT_CLASS } from "../theme/variables"
import { BREAKPOINT_MAX_WIDTH, BREAKPOINT_RANGE, NARROW_BREAKPOINTS } from "./breakpoints"
import type { ResolvedNodeStyles } from "./resolve"

/**
 * Declarations → CSS text.
 *
 * Nothing here trusts its input. Property names are reduced to the characters a
 * CSS property can contain, class names to the characters a CSS identifier can
 * contain, and values have already passed the guard in the schema's theme
 * validation. A document arrives as JSON from a database and may have been
 * authored by an earlier version of the product or imported from a file, so
 * "the schema validated it" is a weaker claim here than it looks.
 *
 * The output is a stylesheet rather than inline styles because a theme change
 * must repaint without re-rendering, and because a `style` attribute cannot
 * express `:hover` or a media query at all.
 */

/** Custom properties keep their leading dashes; everything else is kebab-cased. */
export function propertyName(property: string): string | null {
  if (property.startsWith("--")) {
    return /^--[a-zA-Z0-9-]+$/.test(property) ? property : null
  }

  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(property)) return null

  return property.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

/**
 * The class a node's rules are written against.
 *
 * Derived from the node id, which is stable for the life of the node — so the
 * same document always produces the same stylesheet, which is what "same input,
 * same output" requires of the CSS as much as of the markup.
 */
export function classFor(nodeId: string): string {
  return `ck-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

/** `:hover` and friends. `base` has no suffix. */
const STATE_SUFFIX: Record<StyleState, string> = {
  base: "",
  hover: ":hover",
  focus: ":focus-visible",
  active: ":active",
  disabled: ":disabled,[aria-disabled='true']",
}

/**
 * Focus is `:focus-visible` rather than `:focus`.
 *
 * A focus ring on every mouse click is the single most common way a
 * professional-looking page starts to feel cheap, and keyboard users lose
 * nothing: `:focus-visible` fires for them.
 *
 * Disabled covers the ARIA attribute as well as the DOM property, because most
 * of what a checkout disables is a div with a role rather than a `<button>`.
 */
function selectorFor(className: string, state: StyleState): string {
  const suffix = STATE_SUFFIX[state]

  if (suffix === "") return `.${ROOT_CLASS} .${className}`

  return suffix
    .split(",")
    .map((part) => `.${ROOT_CLASS} .${className}${part}`)
    .join(", ")
}

export function declarationsToCss(declarations: Readonly<Record<string, string>>): string {
  return Object.entries(declarations)
    .map(([property, value]) => {
      const name = propertyName(property)

      return name === null ? null : `  ${name}: ${value};`
    })
    .filter((line): line is string => line !== null)
    .join("\n")
}

function rule(selector: string, declarations: Readonly<Record<string, string>>): string {
  const body = declarationsToCss(declarations)

  return body === "" ? "" : `${selector} {\n${body}\n}\n`
}

/** A node's rules for one breakpoint, every declared state. */
function rulesFor(
  className: string,
  states: Partial<Record<StyleState, Record<string, string>>>,
): string {
  let css = ""

  for (const [state, declarations] of Object.entries(states)) {
    css += rule(selectorFor(className, state as StyleState), declarations)
  }

  return css
}

export interface EmitOptions {
  /** Resolve one breakpoint in JS instead of emitting media queries. */
  activeBreakpoint?: Breakpoint
}

/**
 * A node's stylesheet.
 *
 * With `activeBreakpoint`, one block and no media queries. That is what the
 * editor canvas needs: a 390px device frame inside a 1440px browser window
 * would match the desktop media query, and the user would be editing mobile
 * while looking at desktop.
 *
 * Without it, every breakpoint as media-query CSS. The server cannot know the
 * visitor's viewport, so the HTML is identical at every width — which is what
 * prevents both a wrong first paint and a hydration mismatch.
 */
export function emitNodeCss(
  nodeId: string,
  resolved: ResolvedNodeStyles,
  options: EmitOptions = {},
): string {
  const className = classFor(nodeId)
  const { activeBreakpoint } = options

  if (activeBreakpoint !== undefined) {
    const merged: Partial<Record<StyleState, Record<string, string>>> = {}

    for (const breakpoint of BREAKPOINTS.slice(0, BREAKPOINTS.indexOf(activeBreakpoint) + 1)) {
      for (const [state, declarations] of Object.entries(resolved.blocks[breakpoint])) {
        merged[state as StyleState] = { ...merged[state as StyleState], ...declarations }
      }
    }

    return rulesFor(className, merged)
  }

  let css = rulesFor(className, resolved.blocks.desktop)

  for (const breakpoint of NARROW_BREAKPOINTS) {
    const inner = rulesFor(className, resolved.blocks[breakpoint])
    if (inner === "") continue

    css += `@media (max-width: ${BREAKPOINT_MAX_WIDTH[breakpoint]}px) {\n${indent(inner)}}\n`
  }

  return css
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n")
}

/**
 * Hiding a node at some breakpoints and not others.
 *
 * Expressed as classes on the element and `display: none` in an exclusive
 * media-query range — never by leaving the node out of the HTML. Omitting it
 * would make the markup depend on a width the server cannot see, and every
 * visitor whose width disagreed with the guess would get a hydration mismatch.
 * See docs/renderer.md § Responsive Rendering.
 *
 * The ranges are exclusive so hiding only ever adds a rule. A cascading
 * max-width scheme would have to un-hide a node that reappears at a narrower
 * width, and the only `display` it could restore is the user agent's — which
 * would quietly flatten the node's own `display: flex`.
 */
export const HIDE_CLASS: Record<Breakpoint, string> = {
  desktop: "ck-hide-desktop",
  tablet: "ck-hide-tablet",
  mobile: "ck-hide-mobile",
}

/** Editor preview resolves one breakpoint in JS, so it needs no media query. */
export const HIDE_CLASS_ACTIVE = "ck-hide"

/**
 * Marks a node whose visibility could not be decided on the server.
 *
 * Its rule depends on something only the browser knows — a field the customer
 * has not filled in yet. The node renders, and the plugin owning that source
 * toggles it; this class is how the plugin finds it. The toggling arrives with
 * the forms plugin in Phase 10.
 */
export const DEFERRED_CLASS = "ck-deferred"

/**
 * The classes that hide a node at the breakpoints it is not visible at.
 *
 * With `activeBreakpoint`, a single class or none — the canvas already knows
 * which device it is showing.
 */
export function hideClasses(
  visible: readonly Breakpoint[],
  options: EmitOptions = {},
): readonly string[] {
  const hidden = BREAKPOINTS.filter((breakpoint) => !visible.includes(breakpoint))

  if (options.activeBreakpoint !== undefined) {
    return hidden.includes(options.activeBreakpoint) ? [HIDE_CLASS_ACTIVE] : []
  }

  return hidden.map((breakpoint) => HIDE_CLASS[breakpoint])
}

/**
 * The placeholder a node with no component gets, in the editor.
 *
 * Styled from the theme's own variables rather than from the design system,
 * which the renderer may not import — and `thin` rather than a pixel, because a
 * placeholder's outline is a hairline and there is no token for one.
 *
 * Only ever emitted in a mode that shows fallbacks. A live checkout draws an
 * empty box at the node's reserved space and says nothing, because our
 * internals are none of a customer's business.
 */
export const UNSUPPORTED_CLASS = "ck-unsupported"

export function unsupportedCss(): string {
  return (
    rule(`.${ROOT_CLASS} .${UNSUPPORTED_CLASS}`, {
      display: "flex",
      flexDirection: "column",
      gap: "var(--ck-space-1)",
      padding: "var(--ck-space-5)",
      border: "thin dashed var(--ck-color-border-strong)",
      borderRadius: "var(--ck-radius-md)",
      background: "var(--ck-color-surface-raised)",
      color: "var(--ck-color-foreground-muted)",
      fontFamily: "var(--ck-font-body)",
      fontSize: "var(--ck-text-small-size)",
      lineHeight: "var(--ck-text-small-leading)",
    }) +
    rule(`.${ROOT_CLASS} .${UNSUPPORTED_CLASS} > [data-ck-type]`, {
      fontFamily: "var(--ck-font-mono)",
      fontSize: "var(--ck-text-caption-size)",
      color: "var(--ck-color-foreground)",
    })
  )
}

/**
 * The static rules the hide classes need.
 *
 * Emitted once per page, and only when a node actually uses one — four rules
 * nobody references is four rules every visitor downloads.
 */
export function visibilityCss(used: Iterable<string>): string {
  const classes = new Set(used)
  let css = ""

  if (classes.has(HIDE_CLASS_ACTIVE)) {
    css += rule(`.${ROOT_CLASS} .${HIDE_CLASS_ACTIVE}`, { display: "none !important" })
  }

  for (const breakpoint of BREAKPOINTS) {
    if (!classes.has(HIDE_CLASS[breakpoint])) continue

    const inner = rule(`.${ROOT_CLASS} .${HIDE_CLASS[breakpoint]}`, {
      display: "none !important",
    })

    css += `@media ${BREAKPOINT_RANGE[breakpoint]} {\n${indent(inner)}}\n`
  }

  return css
}
