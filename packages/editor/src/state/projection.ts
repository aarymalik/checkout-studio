import { deserialize, serialize, type CheckoutSchema } from "@checkout-studio/schema"
import type { MigrationRegistry, SchemaProblem } from "@checkout-studio/schema"

import type { BuilderState } from "./types"

/**
 * The only path between the store and storage.
 *
 * `toSchema` drops selection, viewport, history, clipboard and drag state.
 * Persisting them would put UI state inside the schema, which docs/schema.md
 * forbids — and a selection saved into a page is somebody else's selection when
 * they open it.
 *
 * See docs/state-management.md § Serialization.
 */

/** The document, and nothing else. */
export function toSchema(state: BuilderState): CheckoutSchema {
  return state.document
}

/** The document as canonical JSON, ready to store. */
export function toJson(state: BuilderState): string {
  return serialize(state.document)
}

export type LoadResult =
  { ok: true; document: CheckoutSchema } | { ok: false; errors: readonly SchemaProblem[] }

/**
 * A document from storage, validated and migrated before anything sees it.
 *
 * The one door in. Everything that arrives from outside this process — a
 * database row written by an older version, an imported file, a pasted
 * clipboard — comes through here.
 */
export function fromSchema(input: unknown, registry?: MigrationRegistry): LoadResult {
  const result = deserialize(input, registry === undefined ? {} : { registry })

  return result.ok ? { ok: true, document: result.document } : { ok: false, errors: result.errors }
}
