import type { CheckoutSchema } from "../document/schema"

/**
 * Schema migrations.
 *
 * A document is written against a version and read by whatever is running now.
 * The gap between them is closed here, once, before anything else looks at the
 * document — so the renderer supports one shape rather than every shape there
 * has ever been.
 *
 * Migrations are pure and chained: 1.0.0 → 1.1.0 → 2.0.0 runs as two steps, and
 * each is written against the version immediately before it. Writing one
 * migration per pair of versions is how a registry becomes quadratic.
 *
 * See docs/schema.md § Migration.
 */

export interface Migration {
  from: string
  to: string
  /** Pure. Receives a document of version `from`, returns one of version `to`. */
  migrate: (document: CheckoutSchema) => CheckoutSchema
}

export class MigrationError extends Error {
  override readonly name = "MigrationError"
  readonly from: string
  readonly to: string

  constructor(message: string, from: string, to: string) {
    super(message)
    this.from = from
    this.to = to
  }
}

/** Compares `major.minor.patch` numerically, so 1.10.0 is above 1.9.0. */
export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)

  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)

    if (difference !== 0) return difference < 0 ? -1 : 1
  }

  return 0
}

export class MigrationRegistry {
  private readonly steps = new Map<string, Migration>()

  /** The version this registry migrates towards. */
  readonly target: string

  constructor(target: string, migrations: readonly Migration[] = []) {
    this.target = target

    for (const migration of migrations) this.register(migration)
  }

  register(migration: Migration): void {
    if (this.steps.has(migration.from)) {
      throw new MigrationError(
        `Two migrations start at ${migration.from}; a version has one successor.`,
        migration.from,
        migration.to,
      )
    }

    this.steps.set(migration.from, migration)
  }

  /** The versions this registry can read. */
  versions(): readonly string[] {
    return [...this.steps.keys()]
  }

  /**
   * The route from a version to the target, or null when there is none.
   *
   * Exposed so a caller can say what it would do before doing it — the import
   * screen tells somebody their file will be upgraded, and this is how it knows.
   */
  path(from: string): readonly Migration[] | null {
    if (compareVersions(from, this.target) === 0) return []

    const route: Migration[] = []
    const seen = new Set<string>()
    let current = from

    while (compareVersions(current, this.target) !== 0) {
      // A cycle in the registry would otherwise hang here rather than fail.
      if (seen.has(current)) return null
      seen.add(current)

      const step = this.steps.get(current)

      if (step === undefined) return null

      route.push(step)
      current = step.to
    }

    return route
  }
}
