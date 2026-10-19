import { tokenPath } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { readToken, tokenPaths } from "@checkout-studio/renderer"
import type { ControlKind } from "@checkout-studio/plugin-sdk"

/**
 * Which of a theme's tokens a property may hold.
 *
 * ## Why a filter and not the whole list
 *
 * A theme has around sixty tokens and a colour property can use eight of them.
 * Offering all sixty would make the picker a place to make mistakes: there is
 * no sense in which a padding can be `{colors.danger}`, and a list that says
 * otherwise is a list somebody has to read carefully every time.
 *
 * ## Spacing and radius both reach a length
 *
 * A gap is usually a step on the spacing scale and sometimes a radius — a
 * pill's padding matching its corner is a real thing to want. Both are
 * offered, in that order, because the common one should be first.
 */

const GROUPS: Partial<Record<ControlKind, readonly string[]>> = {
  color: ["colors."],
  dimension: ["spacing.", "radius."],
  spacing: ["spacing."],
  radius: ["radius."],
  shadow: ["shadows."],
}

/** Whether this kind of control can hold a token at all. */
export function takesTokens(control: ControlKind): boolean {
  return GROUPS[control] !== undefined
}

export function tokensFor(theme: CheckoutTheme, control: ControlKind): readonly string[] {
  const prefixes = GROUPS[control]

  if (prefixes === undefined) return []

  const all = tokenPaths(theme)

  // In the order the prefixes are listed rather than the theme's, so a gap
  // offers the spacing scale before the radii.
  return prefixes.flatMap((prefix) => all.filter((path) => path.startsWith(prefix)))
}

/** The reference a path is written as in a document. */
export function referenceFor(path: string): string {
  return `{${path}}`
}

/** The path inside a reference, or null when the value is not one. */
export function pathOf(value: unknown): string | null {
  return typeof value === "string" ? tokenPath(value) : null
}

/**
 * What a token is worth, for the moment somebody detaches it.
 *
 * Detaching replaces the reference with what it currently resolves to, so the
 * page does not change the instant a property stops following the theme. A
 * detach that reset the value to nothing would look like the control had
 * cleared itself.
 */
export function resolved(theme: CheckoutTheme, path: string): string {
  const value = readToken(theme, path)

  return value === undefined ? "" : String(value)
}

/** What the picker calls a token: `colors.primary` rather than `{colors.primary}`. */
export function labelFor(path: string): string {
  return path
}
