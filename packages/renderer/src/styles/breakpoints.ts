import { BREAKPOINTS } from "@checkout-studio/schema"
import type { Breakpoint } from "@checkout-studio/schema"

/**
 * Where the breakpoints are.
 *
 * Taken from the device frames in docs/phases.md — desktop 1440, tablet 768,
 * mobile 390 — so what a user arranges on the canvas and what a visitor
 * receives are governed by one set of numbers.
 *
 * Two different shapes, for two different jobs.
 *
 * **Styles cascade**, so they use max-width: a tablet rule is in force at
 * mobile too, and a mobile rule overrides it because it comes later. That is
 * the responsive cascade in docs/theme-system.md, expressed in CSS.
 *
 * **Visibility does not cascade.** "Tablet only" means hidden at desktop *and*
 * mobile, which cascading max-widths cannot say without un-hiding — and
 * un-hiding means guessing what `display` to restore, which would quietly
 * flatten a node's own `display: flex`. Exclusive ranges make hiding purely
 * additive, so nothing is ever put back.
 */

/** For styles. Desktop is the base and has no query. */
export const BREAKPOINT_MAX_WIDTH = { tablet: 1023, mobile: 767 } as const

export type NarrowBreakpoint = keyof typeof BREAKPOINT_MAX_WIDTH

export const NARROW_BREAKPOINTS = BREAKPOINTS.filter(
  (value): value is NarrowBreakpoint => value !== "desktop",
)

/** For visibility. Exactly one matches at any width. */
export const BREAKPOINT_RANGE: Record<Breakpoint, string> = {
  desktop: `(min-width: ${BREAKPOINT_MAX_WIDTH.tablet + 1}px)`,
  tablet: `(min-width: ${BREAKPOINT_MAX_WIDTH.mobile + 1}px) and (max-width: ${BREAKPOINT_MAX_WIDTH.tablet}px)`,
  mobile: `(max-width: ${BREAKPOINT_MAX_WIDTH.mobile}px)`,
}

/** The breakpoint immediately wider than this one, or null for desktop. */
export function widerThan(breakpoint: Breakpoint): Breakpoint | null {
  const index = BREAKPOINTS.indexOf(breakpoint)

  return index === 0 ? null : (BREAKPOINTS[index - 1] as Breakpoint)
}
