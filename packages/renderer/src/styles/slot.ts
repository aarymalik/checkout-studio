import type { ComponentThemeSlotRegistration } from "@checkout-studio/plugin-sdk"

/**
 * A component's theme slot, checked against the schema its plugin registered.
 *
 * The slot is the one part of a theme whose shape the engine does not know.
 * Every other value has a place in `CheckoutTheme` and a typed check in the
 * schema package; a slot is `Record<string, unknown>` by design, so that a
 * second product can add slots without the engine changing.
 *
 * The plugin closes that gap by registering a schema, and this is where the
 * engine spends it — stage 1 of the cascade, immediately before `toStyles`.
 * Without it a wrong-typed value reaches the plugin, becomes something like
 * `maxWidth: "[object Object]"`, and is dropped by the browser with nothing
 * said: the one failure mode a merchant cannot debug.
 *
 * The schema is a gate, not a transform. `parsed.data` is deliberately not
 * used: a slot schema that is not `.strict()` strips the keys it does not
 * declare, and one with a `.default()` or a coercion rewrites what the merchant
 * wrote. Either would change a value nobody asked to change. So the values that
 * reach `toStyles` are the merchant's own, minus whatever the schema refused.
 *
 * See docs/theme-system.md § Component Theme Slots.
 */

export interface SlotProblem {
  /** The slot key refused, or `""` when the schema refused the slot as a whole. */
  key: string
  /** What the engine was about to use, formatted for a message. */
  value: string
  reason: string
}

export interface SlotResolution {
  /** What `toStyles` is handed. Never partially valid: a refused key holds its default. */
  values: Readonly<Record<string, unknown>>
  problems: readonly SlotProblem[]
}

/** Enough of a value to recognise it in a warning, without pasting a document into one. */
function format(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return "nothing"

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    // A circular structure, or a BigInt. Neither belongs in a theme, which is
    // the point of saying so rather than throwing out of a render.
    return String(value)
  }
}

/**
 * The slot values for one component type, with anything the schema refuses
 * replaced by the plugin's default.
 *
 * A refused key falls back whole, even when the failure was nested: a theme
 * that sets `variants.primary.background` to a number loses `variants`, not
 * just that leaf. The schema's unit of meaning is whatever the plugin declared,
 * and splicing a default into the middle of a structure the plugin designed
 * would produce a shape it never validated.
 */
export function resolveSlot(
  registration: ComponentThemeSlotRegistration,
  stored: Readonly<Record<string, unknown>> | undefined,
): SlotResolution {
  const merged = { ...registration.defaults, ...stored }
  const parsed = registration.schema.safeParse(merged)

  if (parsed.success) return { values: merged, problems: [] }

  const problems: SlotProblem[] = []
  const values: Record<string, unknown> = { ...merged }
  const seen = new Set<string>()

  for (const issue of parsed.error.issues) {
    const [first] = issue.path

    // No path means the schema refused the slot rather than a value in it — a
    // non-object, or a rule the plugin wrote across keys. There is no key to
    // restore, so the whole slot falls back.
    if (typeof first !== "string") {
      return {
        values: registration.defaults,
        problems: [{ key: "", value: format(stored), reason: issue.message }],
      }
    }

    // Several issues can share a first segment. One key, one problem.
    if (seen.has(first)) continue
    seen.add(first)

    problems.push({ key: first, value: format(merged[first]), reason: issue.message })

    if (first in registration.defaults) values[first] = registration.defaults[first]
    else delete values[first]
  }

  // Still refused with every bad key back at its default: the plugin's own
  // defaults disagree with its own schema. Nothing here can reconcile that, and
  // the documented fallback is `defaults`.
  return registration.schema.safeParse(values).success
    ? { values, problems }
    : { values: registration.defaults, problems }
}
