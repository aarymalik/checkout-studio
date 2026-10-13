import { collect } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

import { partsOf } from "../components/address/parts"
import { choiceSpecOf } from "../components/choice/spec"
import { specOf } from "../components/input/spec"
import { isShown } from "./conditions"
import type { FieldSpec } from "./fields"
import { schemaFor } from "./schema"

/**
 * What a document asks for, and what a submission is checked against.
 *
 * ## The server does not trust the browser about which fields existed
 *
 * A submission arrives as a flat record of names and strings. Believing it
 * about which fields were on the page would make every rule optional: a
 * payload that simply omits a required field would pass by saying nothing.
 *
 * So the fields come from the stored document, and the conditions are
 * evaluated against the *submitted values* — the same `isShown` the browser
 * ran, over the same descriptors. A field whose condition is not met is not
 * asked for, which is what makes a conditional form checkable at all.
 *
 * ## Why this lives in the plugin
 *
 * Only the forms plugin knows which node types are fields and how to read one.
 * The engine knows a document is a tree of nodes, and that is as far as its
 * business goes.
 */

/**
 * How each field type is read, by the same functions the components use.
 *
 * Named directly rather than through a registry a component registers into.
 * This plugin owns every one of these types, nothing else can add one, and an
 * indirection for extensibility nobody has is a layer that hides which of
 * these is out of date.
 */
const READERS: Readonly<Record<string, (node: Node) => readonly FieldSpec[]>> = {
  "core.input": (node) => [specOf(node.props, node.id)],
  "core.textarea": (node) => [specOf(node.props, node.id)],
  "core.select": (node) => [choiceSpecOf(node.props, node.id, "select", "Choose")],
  "core.country": (node) => [choiceSpecOf(node.props, node.id, "select", "Country")],
  "core.checkbox": (node) => [choiceSpecOf(node.props, node.id, "checkbox", "Tick to agree")],
  "core.radio-group": (node) => [choiceSpecOf(node.props, node.id, "radio", "Choose one")],
  "core.address": (node) => partsOf(node.props, node.id),
}

/** Every field the document declares, in document order. */
export function fieldsIn(document: CheckoutSchema): readonly FieldSpec[] {
  const specs: FieldSpec[] = []

  for (const node of collect(document)) {
    const read = READERS[node.type]

    if (read !== undefined) specs.push(...read(node))
  }

  return specs
}

export interface SubmissionCheck {
  /** The values to save, with anything the document does not ask for removed. */
  values: Record<string, string>
  /** Field name to message, empty when the submission is good. */
  errors: Record<string, string>
}

/**
 * Checks a submitted payload against the page that asked for it.
 *
 * Anything the document does not ask for is dropped rather than refused. A
 * stale tab submitting a field the merchant has since removed is an ordinary
 * thing, and refusing the whole submission over it would lose an order to
 * tidiness — but storing it would let anybody write whatever they liked into
 * a page's submissions.
 */
export function checkSubmission(
  document: CheckoutSchema,
  payload: Readonly<Record<string, unknown>>,
): SubmissionCheck {
  const submitted: Record<string, string> = {}

  for (const [name, value] of Object.entries(payload)) {
    if (typeof value === "string") submitted[name] = value
  }

  const declared = fieldsIn(document)
  const names = new Set(declared.map((spec) => spec.name))

  /*
   * Which fields the page would have shown, decided from the values that
   * arrived. A condition watching a field that is not on the page is not met,
   * exactly as in the browser — `isShown` is the same function.
   */
  const asked = declared.filter((spec) => isShown(spec.showWhen ?? null, submitted, names))

  const values: Record<string, string> = {}

  for (const spec of asked) values[spec.name] = submitted[spec.name] ?? ""

  const { schema } = schemaFor(asked)
  const parsed = schema.safeParse(values)

  if (parsed.success) return { values, errors: {} }

  const errors: Record<string, string> = {}

  for (const issue of parsed.error.issues) {
    const name = issue.path[0]

    if (typeof name === "string" && errors[name] === undefined) errors[name] = issue.message
  }

  return { values, errors }
}
