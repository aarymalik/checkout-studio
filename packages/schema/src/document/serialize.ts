import { migrate, type MigrationOutcome } from "../migrate/migrate"
import type { MigrationRegistry } from "../migrate/registry"
import { canonicalJson } from "./normalize"
import { parseDocument, validateReferences, type SchemaProblem } from "./validate"
import type { CheckoutSchema } from "./schema"

/**
 * Getting a document in and out of storage.
 *
 * Out is easy. In is the only place a document arrives from somewhere that is
 * not this process — a database row written by an older version, a pasted
 * clipboard, an imported file — so it is the only place that has to assume the
 * worst.
 *
 * Order matters: parse the shape, then migrate it, then check its references.
 * Validating references first would reject a document that an older version
 * wrote correctly and the migration would have fixed.
 *
 * See docs/state-management.md § Deserialization.
 */

/**
 * What was thrown, as something a person can read.
 *
 * A migration is supplied by a caller and may throw anything at all — a string,
 * an object, undefined. Losing that to "[object Object]" in an error message is
 * how a broken migration becomes unexplainable.
 */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message

  return typeof error === "string" && error !== "" ? error : fallback
}

/** The document as bytes, in canonical form so equal documents compare equal. */
export function serialize(document: CheckoutSchema): string {
  return canonicalJson(document)
}

export type DeserializeResult =
  | { ok: true; document: CheckoutSchema; migration: MigrationOutcome | null }
  | { ok: false; errors: readonly SchemaProblem[] }

export interface DeserializeOptions {
  /** Omitted means the document is expected to be current already. */
  registry?: MigrationRegistry
}

/**
 * Read a document from unknown input.
 *
 * Takes a parsed value or a string. A caller holding JSON should not have to
 * parse it just to hand it over, and a caller holding an object should not have
 * to stringify it.
 */
export function deserialize(input: unknown, options: DeserializeOptions = {}): DeserializeResult {
  let value = input

  if (typeof input === "string") {
    try {
      value = JSON.parse(input)
    } catch (error) {
      return {
        ok: false,
        errors: [
          {
            code: "structure",
            message: `Not JSON: ${messageOf(error, "unreadable")}`,
            nodeIds: [],
            path: "(root)",
          },
        ],
      }
    }
  }

  const parsed = parseDocument(value)

  if (!parsed.ok) return { ok: false, errors: parsed.errors }

  let document = parsed.document
  let migration: MigrationOutcome | null = null

  if (options.registry !== undefined) {
    try {
      migration = migrate(document, options.registry)
      document = migration.document
    } catch (error) {
      return {
        ok: false,
        errors: [
          {
            code: "structure",
            message: messageOf(error, "The migration failed without saying why."),
            nodeIds: [],
            path: "version",
          },
        ],
      }
    }
  }

  const problems = validateReferences(document)

  if (problems.length > 0) return { ok: false, errors: problems }

  return { ok: true, document, migration }
}
