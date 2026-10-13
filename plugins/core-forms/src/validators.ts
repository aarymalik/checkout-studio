import { collect } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"

import { conditionOf, cyclesIn } from "./form/conditions"
import type { FieldCondition } from "./form/conditions"

/**
 * Conditions that wait for each other.
 *
 * A document rule, because no field can answer it alone: whether a condition is
 * circular depends entirely on what the field it watches is waiting for.
 *
 * Two fields each waiting for the other can never both be on the page, and the
 * merchant will not see it — the canvas shows the fields, and the customer
 * sees neither. Worse, a cycle can oscillate: hiding a field removes its value,
 * which can satisfy the condition that hid it.
 *
 * An error, so it blocks publishing. The person publishing cannot tell by
 * looking, and what lands on a customer is a question missing from the page.
 */
export const CONDITION_CYCLE_RULE = "core-forms.condition-cycle"

/** The field name a node submits under — the prop, or the node's id. */
function nameOf(node: Node): string {
  const name = node.props["name"]

  return typeof name === "string" && name.trim() !== "" ? name : node.id
}

/** Every field in the document, and what it waits for. */
function conditions(document: CheckoutSchema): Map<string, FieldCondition | null> {
  const found = new Map<string, FieldCondition | null>()

  for (const node of collect(document)) {
    if (!node.type.startsWith("core.")) continue

    const condition = conditionOf(node.props["showWhen"])

    /*
     * Only nodes that are fields. A `showWhen` on something that is not one is
     * a prop nobody reads, and reporting a cycle through it would be reporting
     * a cycle that cannot happen.
     */
    if (FIELD_TYPES.has(node.type)) found.set(nameOf(node), condition)
  }

  return found
}

const FIELD_TYPES: ReadonlySet<string> = new Set([
  "core.input",
  "core.textarea",
  "core.select",
  "core.checkbox",
  "core.radio-group",
  "core.country",
  "core.address",
])

export const conditionCycles: DocumentValidatorRegistration = {
  rule: CONDITION_CYCLE_RULE,
  label: "Conditions do not wait for each other",
  validate: (document) => {
    const byName = conditions(document)
    const cycle = cyclesIn(byName)

    if (cycle.length === 0) return []

    const nodes = [...collect(document)].filter(
      (node) => FIELD_TYPES.has(node.type) && cycle.includes(nameOf(node)),
    )

    const issue: ValidationIssue = {
      rule: CONDITION_CYCLE_RULE,
      severity: "error",
      message: `These fields wait for each other, so none of them can appear: ${cycle.join(", ")}.`,
      nodeIds: nodes.map((node) => node.id),
    }

    return [issue]
  },
}
