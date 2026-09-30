import { BREAKPOINTS } from "@checkout-studio/schema"
import type { Breakpoint, Node, VisibilityCondition } from "@checkout-studio/schema"

/**
 * Visibility, decided before anything renders.
 *
 * Three questions, in order, and the order matters:
 *
 *   1. Is the node hidden outright? Then it is not rendered, children included.
 *   2. Is it hidden at some breakpoints? Then it *is* rendered, and CSS hides
 *      it at those widths.
 *   3. Do its conditions hold? Then it renders; if they demonstrably do not, it
 *      is skipped; and if they cannot be decided here, it renders and something
 *      on the client decides.
 *
 * The second and third differ for a reason worth stating. A breakpoint is a
 * property of the visitor's window, which the server cannot see — so omitting
 * the node would make the HTML depend on a guess, and every visitor whose width
 * disagreed would get a hydration mismatch. A condition is a property of the
 * order or the customer, which the server *can* see, so a node whose condition
 * is false never reaches the browser at all. That is a privacy property as much
 * as a performance one: a "shown only to customers in Germany" block should not
 * be sitting in everyone's HTML.
 *
 * See docs/renderer.md § Visibility Rules.
 */

export type Decision =
  /** Render it. */
  | "visible"
  /** Do not render it, or its children. */
  | "hidden"
  /** Render it; a client-side rule decides whether it is shown. */
  | "deferred"

export interface VisibilityResult {
  decision: Decision
  /** The breakpoints it may appear at. All three unless the node narrowed them. */
  breakpoints: readonly Breakpoint[]
}

/**
 * Values the conditions are evaluated against.
 *
 * Supplied by whoever is rendering — the checkout plugin contributes the order
 * and the customer, the forms plugin contributes field values. The engine
 * defines the shape and never the sources, which is what keeps a cart out of
 * the renderer.
 *
 * A source missing from this record is undecidable, not false. "Hide unless the
 * coupon is applied" must not hide the node just because nobody has told us
 * about coupons yet.
 */
export type ConditionSources = Readonly<Record<string, unknown>>

export function evaluateCondition(
  condition: VisibilityCondition,
  sources: ConditionSources,
): boolean | null {
  const present = Object.hasOwn(sources, condition.source)

  if (!present) return null

  if (condition.operator === "exists") return sources[condition.source] != null
  if (condition.operator === "empty") return isEmpty(sources[condition.source])

  const actual = sources[condition.source]
  const expected = condition.value ?? null

  switch (condition.operator) {
    case "equals":
      return actual === expected
    case "not-equals":
      return actual !== expected
    case "greater-than":
      return compare(actual, expected, (left, right) => left > right)
    case "less-than":
      return compare(actual, expected, (left, right) => left < right)
  }
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0

  return false
}

/**
 * A numeric comparison, or nothing.
 *
 * Comparing a string to a number with `>` is a source of results nobody
 * intended — `"10" > 9` is true, `"10" > "9"` is false. Both sides must be
 * numbers, and anything else is undecidable rather than quietly answered.
 */
function compare(
  actual: unknown,
  expected: unknown,
  test: (left: number, right: number) => boolean,
): boolean | null {
  if (typeof actual !== "number" || typeof expected !== "number") return null

  return test(actual, expected)
}

export function evaluateVisibility(node: Node, sources: ConditionSources): VisibilityResult {
  const breakpoints = node.visibility.breakpoints ?? BREAKPOINTS

  // The editor's own switch, and it is absolute. A hidden node renders nowhere,
  // at no width, under no condition.
  if (node.visibility.hidden) return { decision: "hidden", breakpoints }

  if (breakpoints.length === 0) return { decision: "hidden", breakpoints }

  const conditions = node.visibility.conditions ?? []
  let deferred = false

  for (const condition of conditions) {
    const result = evaluateCondition(condition, sources)

    if (result === false) return { decision: "hidden", breakpoints }
    if (result === null) deferred = true
  }

  return { decision: deferred ? "deferred" : "visible", breakpoints }
}
