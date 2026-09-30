import type { CheckoutSchema } from "../document/schema"
import { compareVersions, MigrationError, type MigrationRegistry } from "./registry"

/**
 * Bringing a document up to date.
 *
 * All or nothing. A half-migrated document is worse than an unopenable one: it
 * validates, it renders, and it is wrong in ways nobody looks for. Each step
 * runs on the result of the last, and any failure throws before the caller sees
 * anything.
 *
 * See docs/schema.md § Migration.
 */

export interface MigrationOutcome {
  document: CheckoutSchema
  /** The version it arrived as. */
  from: string
  /** Which steps ran, in order. Empty when it was already current. */
  applied: readonly string[]
}

/**
 * Migrate a document to the registry's target version.
 *
 * Pure: the input is never modified, including when a migration is written
 * carelessly — each step's output is what the next receives, and the original
 * is only ever read.
 */
export function migrate(document: CheckoutSchema, registry: MigrationRegistry): MigrationOutcome {
  const from = document.version

  if (compareVersions(from, registry.target) > 0) {
    throw new MigrationError(
      `This document is version ${from}, and this version of Checkout Studio reads up to ${registry.target}. Update to open it.`,
      from,
      registry.target,
    )
  }

  const route = registry.path(from)

  if (route === null) {
    throw new MigrationError(
      `No way to read version ${from}. Known versions: ${registry.versions().join(", ") || "none"}.`,
      from,
      registry.target,
    )
  }

  let current = document
  const applied: string[] = []

  for (const step of route) {
    current = { ...step.migrate(current), version: step.to }
    applied.push(`${step.from} → ${step.to}`)
  }

  return { document: current, from, applied }
}

/** Whether this registry could read a document of that version. */
export function canMigrate(version: string, registry: MigrationRegistry): boolean {
  return compareVersions(version, registry.target) <= 0 && registry.path(version) !== null
}
