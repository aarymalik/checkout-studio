import { primitives } from "../tokens/primitives"

/**
 * The studio frame's dimensions, as numbers.
 *
 * The tokens are the source: a panel's minimum is a design decision recorded in
 * `primitives`, and reading it from there means the CSS that lays the panel out
 * and the JavaScript that clamps a drag can never disagree about what 260px is.
 *
 * Numbers rather than strings, because a resize handle does arithmetic.
 *
 * See docs/ui-guidelines.md § Studio Layout.
 */

function pixels(name: keyof typeof primitives): number {
  const value = Number.parseInt(primitives[name], 10)

  if (Number.isNaN(value)) {
    throw new Error(`Layout token "${name}" is not a pixel value: ${primitives[name]}`)
  }

  return value
}

/** A panel that can be dragged, with the range it may be dragged within. */
export interface PanelBounds {
  default: number
  min: number
  max: number
}

export const LAYOUT = {
  toolbarHeight: pixels("layout-toolbar"),
  statusBarHeight: pixels("layout-status-bar"),

  left: {
    default: pixels("layout-panel-left"),
    min: pixels("layout-panel-left-min"),
    max: pixels("layout-panel-left-max"),
  } satisfies PanelBounds,

  /** Icons only. Wide enough for a 40px control with its padding. */
  leftCollapsed: pixels("layout-panel-left-collapsed"),

  right: {
    default: pixels("layout-panel-right"),
    min: pixels("layout-panel-right-min"),
    max: pixels("layout-panel-right-max"),
  } satisfies PanelBounds,
} as const

/** A width brought inside its panel's range. */
export function clampWidth(width: number, bounds: PanelBounds): number {
  if (!Number.isFinite(width)) return bounds.default

  return Math.min(Math.max(Math.round(width), bounds.min), bounds.max)
}
