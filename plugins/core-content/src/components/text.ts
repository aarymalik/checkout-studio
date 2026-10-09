import type { Node } from "@checkout-studio/schema"

/**
 * The text a content node holds, as a string.
 *
 * Every component here takes its words through one prop and reads it through
 * this. The prop arrives resolved — a `$var` reference has already become a
 * value — so a component never sees a reference, and a bound heading is the
 * same code path as a typed one.
 *
 * A number is accepted and stringified because a bound variable may be one: a
 * price, a quantity, a countdown. Refusing it would make "Qty: {quantity}"
 * render nothing with no error anywhere.
 */
export function textOf(props: Readonly<Record<string, unknown>>): string {
  const value = props["text"]

  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)

  return ""
}

/**
 * Whether a node has nothing to say.
 *
 * Whitespace counts as nothing. A heading holding three spaces is a heading
 * that reads as empty to everybody, takes up a line, and is announced as a
 * heading with no text — which is worse than one that is visibly missing.
 */
export function hasNoText(node: Node): boolean {
  const value = node.props["text"]

  if (typeof value === "number") return false

  return typeof value !== "string" || value.trim() === ""
}
