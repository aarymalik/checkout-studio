/**
 * Showing a field because of another field's answer.
 *
 * ## Why this is not the engine's visibility conditions
 *
 * A node already has `visibility.conditions`, which the renderer evaluates
 * against sources the plugins supply, and a `deferred` decision for a rule the
 * server cannot settle — "a field the customer has not filled in" is the
 * example in its own comment. That is the right mechanism for conditioning
 * *any* node on a field, and it is not what this is.
 *
 * It cannot be, yet, for a specific reason. The engine defers by rendering the
 * node and marking it; something on the client then shows or hides it. Hiding
 * an element does not unmount it, so a hidden *field* would still be
 * registered — and "hidden field values are excluded from submission" would
 * need a second mechanism to go and remove them, which is exactly the kind of
 * pair that agrees until it does not.
 *
 * A condition on the field itself unmounts the component. `useField`'s cleanup
 * takes the value and the error with it, so the exclusion is a property of
 * React rather than bookkeeping. One mechanism, and the requirement falls out
 * of it.
 *
 * **What this does not do**, recorded in docs/component-library.md: conditioning
 * a Heading or a Section on a field's answer. That needs the engine's deferred
 * path to carry its conditions to the client, and the unmounting problem
 * solved for fields inside the hidden subtree.
 *
 * ## No inspector control yet, and not for the usual reason
 *
 * Every other property is declared now and rendered by the inspector in Phase
 * 12. A condition cannot be: it is three values under one key, and a property
 * definition addresses a prop by a single name — `showWhen.field` would store
 * a prop called exactly that, flat, which is not what is read here.
 *
 * The alternatives are a nested key in the property schema or a control kind
 * that owns all three, and both are decisions about the inspector rather than
 * about conditions. Recorded in docs/component-library.md § Conditional fields
 * so Phase 12 meets it as a question rather than as a surprise.
 */

export const CONDITION_OPERATORS = ["equals", "not-equals", "exists", "empty"] as const

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

export interface FieldCondition {
  /** The name of the field this one watches. */
  field: string
  operator: ConditionOperator
  /** Compared as text, because every value in the form is text. */
  value?: string
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/** The condition a node declares, if it declares a usable one. */
export function conditionOf(value: unknown): FieldCondition | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null

  const raw = value as Record<string, unknown>
  const field = text(raw["field"])
  const operator = raw["operator"]

  if (field === undefined) return null
  if (!CONDITION_OPERATORS.includes(operator as ConditionOperator)) return null

  const compared = raw["value"]

  return {
    field,
    operator: operator as ConditionOperator,
    ...(typeof compared === "string" ? { value: compared } : {}),
  }
}

/**
 * Whether a field with this condition should be on the page.
 *
 * A condition watching a field that is not there is **not met**, and that is
 * the safer of the two readings: the field it depends on may itself be hidden,
 * and showing a question whose premise is not on the page is how somebody ends
 * up answering something that does not apply to them.
 *
 * It also makes a chain behave. Hiding the first field in `A → B → C` hides the
 * second, which hides the third, because each is deciding from values rather
 * than from the one before it.
 */
export function isShown(
  condition: FieldCondition | null,
  values: Readonly<Record<string, string>>,
  registered: ReadonlySet<string>,
): boolean {
  if (condition === null) return true
  if (!registered.has(condition.field)) return false

  const value = values[condition.field] ?? ""

  switch (condition.operator) {
    case "exists":
      return value !== ""
    case "empty":
      return value === ""
    case "equals":
      return value === (condition.value ?? "")
    case "not-equals":
      return value !== (condition.value ?? "")
  }
}

/**
 * The fields whose conditions form a cycle.
 *
 * Two fields each waiting for the other is a pair that can never both be on the
 * page, and a page the merchant cannot see is broken on. Worse, a cycle can
 * oscillate: hiding a field removes its value, which can satisfy the condition
 * that hid it.
 *
 * Reported rather than resolved. There is no correct way to pick which half of
 * a cycle to keep, and guessing would hide a question from a customer that the
 * merchant believes is on the page.
 */
export function cyclesIn(
  conditions: ReadonlyMap<string, FieldCondition | null>,
): readonly string[] {
  const inCycle = new Set<string>()

  for (const start of conditions.keys()) {
    const seen = new Set<string>()
    let current: string | undefined = start

    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      current = conditions.get(current)?.field
    }

    // Came back to where it started, rather than running out of conditions.
    if (current === start) for (const name of seen) inCycle.add(name)
  }

  return [...inCycle].sort()
}
