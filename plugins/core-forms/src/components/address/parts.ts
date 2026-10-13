import type { FieldKind, FieldSpec } from "../../form/fields"

/**
 * What an address is made of.
 *
 * ## One component, several fields
 *
 * The first composite in the form system. An address is not one answer — it is
 * five or six, each needing its own label, its own validation and its own place
 * in a submission — but it is one thing a merchant drops onto a page, because
 * nobody wants to assemble one out of six Inputs and get the order wrong.
 *
 * So the component registers a field per part, under a name derived from its
 * own: `address.line1`, `address.city`. Flat keys, because the form holds one
 * record of strings; the dots are a convention the submission can read back
 * into a shape later, and a convention costs nothing until something needs it.
 *
 * ## The names are the schema
 *
 * A part is identified by its key, not by its position. Reordering them on the
 * page cannot change what a saved address means, and a merchant hiding the
 * second line does not shift everything after it.
 *
 * ## Deliberately not per-country
 *
 * An address form that rearranges itself by country is the right answer and a
 * much bigger one: the parts differ, their names differ, and whether a postal
 * code exists at all differs. What is here is the shape most countries share,
 * with labels a merchant can reword — and the honest note that a Japanese
 * address does not look like this. Recorded in component-library.md § Address.
 */

export interface AddressPart {
  /** The suffix after the field's own name. */
  key: string
  label: string
  kind: FieldKind
  /** Whether it is asked for at all unless the merchant turns it off. */
  optional?: boolean
}

export const ADDRESS_PARTS: readonly AddressPart[] = [
  { key: "line1", label: "Address", kind: "text" },
  { key: "line2", label: "Address line 2", kind: "text", optional: true },
  { key: "city", label: "Town or city", kind: "text" },
  { key: "region", label: "County or state", kind: "text", optional: true },
  { key: "postcode", label: "Postcode", kind: "text" },
]

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/**
 * The fields this node asks for.
 *
 * A part the merchant turned off is not in the list, so it is never registered
 * and its value is never in the submission — the same mechanism a condition
 * will use, and the reason there is no second one.
 */
export function partsOf(
  props: Readonly<Record<string, unknown>>,
  nodeId: string,
): readonly FieldSpec[] {
  const name = text(props["name"]) ?? nodeId
  const required = props["required"] !== false

  return ADDRESS_PARTS.filter((part) => props[`show${part.key}`] !== false).map((part) => ({
    name: `${name}.${part.key}`,
    kind: part.kind,
    label: text(props[`label${part.key}`]) ?? part.label,
    /*
     * An optional part is optional whatever the field says. "Address line 2 is
     * required" is a sentence no checkout should produce, and a county is not
     * a thing every address has.
     */
    required: required && part.optional !== true,
  }))
}
