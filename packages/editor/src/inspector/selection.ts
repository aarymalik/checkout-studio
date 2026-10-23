import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

/**
 * Editing several components at once.
 *
 * ## What the panel can offer
 *
 * Only what every one of them has. A Heading and a Button both have a font
 * size and the panel can set both at once; only the Heading has a level, and a
 * control that wrote one to a Button would be writing a prop the component
 * does not read.
 *
 * Matched on key, target and control rather than on key alone. Two components
 * may both call something `size` and mean a number in one and a length in the
 * other — one editor over two shapes would write whichever it drew into both.
 *
 * ## What it cannot show
 *
 * A value the selection does not agree on. Showing the first node's is the
 * tempting bug: the panel would read as though every selected component had
 * 16px padding, and the first keystroke anywhere else would make that true.
 * `mixedKeys` names those, and every control draws them as "Mixed".
 */

/** The identity of a property, for the purpose of being the same property. */
function signature(definition: PropertyDefinition): string {
  return `${definition.target}:${definition.key}:${definition.control}`
}

/**
 * The properties every selected component registered.
 *
 * In the first selection's order, because that is the one whose panel this
 * was before anything else was added to it — and the sections' order is fixed
 * anyway, so the only thing at stake is the order within a section.
 */
export function commonProperties(
  perNode: readonly (readonly PropertyDefinition[])[],
): readonly PropertyDefinition[] {
  const [first, ...rest] = perNode

  if (first === undefined) return []
  if (rest.length === 0) return first

  const shared = rest.map((definitions) => new Set(definitions.map(signature)))

  return first.filter((definition) => shared.every((one) => one.has(signature(definition))))
}

/**
 * The keys the selection does not agree on.
 *
 * Compared by value, not by identity: two nodes holding `16px` agree, and two
 * holding the side bags that `valuesFor` assembles agree when the assembled
 * shorthands match. A key missing from one and present in another counts as a
 * disagreement, which is why `undefined` is compared rather than skipped.
 */
export function mixedKeys(
  perNode: readonly Readonly<Record<string, unknown>>[],
): ReadonlySet<string> {
  const [first, ...rest] = perNode
  const mixed = new Set<string>()

  if (first === undefined || rest.length === 0) return mixed

  for (const key of Object.keys(first)) {
    if (rest.some((values) => values[key] !== first[key])) mixed.add(key)
  }

  return mixed
}
