import type { CheckoutSchema } from "./schema"

/**
 * Canonical form.
 *
 * Two documents that describe the same page must produce the same bytes, so
 * that a hash can answer "did anything change?" and a diff can show only what
 * did. Without this, re-serialising an unedited document in a different key
 * order looks like an edit — and autosave would write on every open.
 *
 * Object keys are sorted; array order is never touched. `children` is the
 * document's own statement about what comes first, and sorting it would reorder
 * the page.
 *
 * See docs/schema.md § Serialization.
 */

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      // Undefined is not JSON. Dropping it here rather than letting
      // JSON.stringify do it means the in-memory canonical form and the bytes
      // agree about what the document contains.
      .filter(([, item]) => item !== undefined)
      // Keys within one object are unique, so there is no equal case.
      .sort(([left], [right]) => (left < right ? -1 : 1))

    const result: Record<string, unknown> = {}

    for (const [key, item] of entries) result[key] = canonical(item)

    return result
  }

  return value
}

/** The document in canonical form. Pure; the input is untouched. */
export function normalize(document: CheckoutSchema): CheckoutSchema {
  return canonical(document) as CheckoutSchema
}

/**
 * The canonical JSON of a document.
 *
 * What to hash, what to diff, and what to compare when deciding whether
 * anything actually changed.
 */
export function canonicalJson(document: CheckoutSchema): string {
  return JSON.stringify(normalize(document))
}

/** Whether two documents describe the same page, whatever order they are in. */
export function equivalent(left: CheckoutSchema, right: CheckoutSchema): boolean {
  return canonicalJson(left) === canonicalJson(right)
}
