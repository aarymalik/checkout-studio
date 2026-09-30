import {
  CURRENT_VERSION,
  MigrationRegistry,
  canMigrate,
  migrate,
  parseDocument,
  validate,
  validateTheme,
} from "@checkout-studio/schema"
import type { CheckoutSchema, CheckoutTheme, SchemaProblem } from "@checkout-studio/schema"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"

import { referenceProblems } from "../styles/tokens"

/**
 * Validate → migrate, before anything renders.
 *
 * The published checkout must always render, and the way to keep that promise
 * is to find out *before* committing to a tree whether this document can
 * produce one. A failure here is a signal to the application, which owns the
 * fallback chain:
 *
 * ```
 * this revision → the last known good revision → a branded error page
 * ```
 *
 * The renderer cannot walk that chain itself: it has no database and no idea
 * what a revision is. Asking it to would put server code inside the one package
 * that ships to a customer's browser.
 *
 * See docs/error-handling.md § Renderer Error Handling.
 */

export type PrepareFailureCode =
  /** The value is not a checkout document at all. */
  | "invalid"
  /** It is a document, but references inside it do not hold together. */
  | "inconsistent"
  /** Its version is newer than this renderer, or no path leads from it to ours. */
  | "unsupported-version"
  /** A migration exists but failed. */
  | "migration-failed"

export interface PrepareFailure {
  ok: false
  code: PrepareFailureCode
  message: string
  problems: readonly SchemaProblem[]
}

export interface PrepareSuccess {
  ok: true
  /** Migrated to the current version, and consistent. */
  document: CheckoutSchema
  /** Worth reporting, never fatal: an unknown component type lives here. */
  warnings: readonly SchemaProblem[]
}

export type PrepareResult = PrepareSuccess | PrepareFailure

export interface PrepareOptions {
  registry: RendererRegistry
  /** The migrations this installation knows. Defaults to none, which is correct at 1.0.0. */
  migrations?: MigrationRegistry
  /**
   * The theme, checked at the same time.
   *
   * A circular token reference is rejected here rather than discovered
   * mid-render, per docs/theme-system.md § Reference Syntax. By the time a
   * cycle showed up during rendering, half the page would already be emitted.
   */
  theme?: CheckoutTheme
}

function failure(
  code: PrepareFailureCode,
  message: string,
  problems: readonly SchemaProblem[] = [],
): PrepareFailure {
  return { ok: false, code, message, problems }
}

export function prepare(value: unknown, options: PrepareOptions): PrepareResult {
  const parsed = parseDocument(value)

  if (!parsed.ok) {
    return failure("invalid", "This is not a checkout document.", parsed.errors)
  }

  const migrations = options.migrations ?? new MigrationRegistry(CURRENT_VERSION)
  const outcome = migrateTo(parsed.document, migrations)

  if (!outcome.ok) return outcome

  const knownTypes = new Set(options.registry.types())
  const result = validate(outcome.document, {
    knownTypes,
    components: options.registry.componentValidators(),
  })

  if (!result.valid) {
    return failure("inconsistent", "This document does not hold together.", result.errors)
  }

  const warnings = [...result.warnings, ...themeWarnings(options.theme)]

  return { ok: true, document: outcome.document, warnings }
}

function migrateTo(
  document: CheckoutSchema,
  migrations: MigrationRegistry,
): PrepareSuccess | PrepareFailure {
  // The registry's target, not the schema package's constant. They agree today
  // and will not once a 1.1.0 exists: the constant says what a new document is
  // written at, and the target says what this installation can read up to.
  if (document.version === migrations.target) {
    return { ok: true, document, warnings: [] }
  }

  if (!canMigrate(document.version, migrations)) {
    return failure(
      "unsupported-version",
      `This page was written for schema ${document.version}, and there is no path from there to ${migrations.target}.`,
    )
  }

  try {
    return { ok: true, document: migrate(document, migrations).document, warnings: [] }
  } catch (error) {
    // A migration step of our own threw. Nothing the page can do about it, and
    // the application falls back to the last revision that did not need this
    // step.
    return failure("migration-failed", error instanceof Error ? error.message : String(error))
  }
}

/**
 * Theme problems, as warnings.
 *
 * Never fatal. A theme with one unresolvable reference still renders a
 * checkout, with that value falling back to the component default — and a
 * checkout with one wrong colour is worth far more than no checkout.
 */
function themeWarnings(theme: CheckoutTheme | undefined): readonly SchemaProblem[] {
  if (theme === undefined) return []

  const problems: SchemaProblem[] = []

  for (const problem of validateTheme(theme)) {
    problems.push({
      code: "component",
      nodeIds: [],
      path: problem.path,
      message: `The theme's ${problem.path} ("${problem.value}") is not valid: ${problem.reason}`,
    })
  }

  for (const problem of referenceProblems(theme)) {
    problems.push({
      code: "component",
      nodeIds: [],
      path: problem.path,
      message: `The theme's ${problem.path} references ${problem.value}, which is ${problem.code} (${problem.chain.join(" → ")}).`,
    })
  }

  return problems
}
