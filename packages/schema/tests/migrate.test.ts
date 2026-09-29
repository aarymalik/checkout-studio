import { describe, expect, it } from "vitest"

import { canMigrate, migrate } from "../src/migrate/migrate"
import { compareVersions, MigrationError, MigrationRegistry } from "../src/migrate/registry"
import type { CheckoutSchema } from "../src/document/schema"
import { sampleDocument } from "./support"

/**
 * Migration.
 *
 * All or nothing. A half-migrated document is worse than an unopenable one: it
 * validates, it renders, and it is wrong in ways nobody looks for.
 */

/** Records that it ran, so a chain can be observed rather than inferred. */
function step(from: string, to: string, mark: string) {
  return {
    from,
    to,
    migrate: (document: CheckoutSchema): CheckoutSchema => ({
      ...document,
      settings: {
        ...document.settings,
        customCss: `${document.settings.customCss ?? ""}${mark}`,
      },
    }),
  }
}

describe("compareVersions", () => {
  it("orders by number, not by string", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1)
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1)
  })

  it("recognises equality", () => {
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0)
  })

  it("treats a missing segment as zero, on either side", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.0", "1.0")).toBe(0)
    expect(compareVersions("1.1", "1.0.0")).toBe(1)
  })
})

describe("MigrationRegistry", () => {
  it("has no route to offer when it knows nothing", () => {
    expect(new MigrationRegistry("1.0.0").versions()).toEqual([])
  })

  it("reports an empty route for a document already current", () => {
    expect(new MigrationRegistry("1.0.0").path("1.0.0")).toEqual([])
  })

  it("chains one step to the next", () => {
    const registry = new MigrationRegistry("2.0.0", [
      step("1.0.0", "1.1.0", "a"),
      step("1.1.0", "2.0.0", "b"),
    ])

    expect(registry.path("1.0.0")).toHaveLength(2)
    expect(registry.versions()).toEqual(["1.0.0", "1.1.0"])
  })

  it("has no route when a step is missing", () => {
    const registry = new MigrationRegistry("2.0.0", [step("1.0.0", "1.1.0", "a")])

    expect(registry.path("1.0.0")).toBeNull()
  })

  // A version has one successor; two would make the result depend on
  // registration order.
  it("refuses two migrations starting at the same version", () => {
    const registry = new MigrationRegistry("2.0.0", [step("1.0.0", "1.1.0", "a")])

    expect(() => registry.register(step("1.0.0", "1.2.0", "b"))).toThrow(MigrationError)
  })

  // Otherwise this hangs rather than failing.
  it("gives up on a registry that loops", () => {
    const registry = new MigrationRegistry("9.0.0", [
      step("1.0.0", "1.1.0", "a"),
      step("1.1.0", "1.0.0", "b"),
    ])

    expect(registry.path("1.0.0")).toBeNull()
  })
})

describe("migrate", () => {
  it("returns a document that is already current, untouched", () => {
    const document = sampleDocument()
    const outcome = migrate(document, new MigrationRegistry("1.0.0"))

    expect(outcome.document).toBe(document)
    expect(outcome.applied).toEqual([])
  })

  it("applies one step", () => {
    const registry = new MigrationRegistry("1.1.0", [step("1.0.0", "1.1.0", "a")])
    const outcome = migrate(sampleDocument(), registry)

    expect(outcome.document.version).toBe("1.1.0")
    expect(outcome.document.settings.customCss).toBe("a")
    expect(outcome.applied).toEqual(["1.0.0 → 1.1.0"])
  })

  it("chains across three versions, in order", () => {
    const registry = new MigrationRegistry("2.0.0", [
      step("1.0.0", "1.1.0", "a"),
      step("1.1.0", "2.0.0", "b"),
    ])
    const outcome = migrate(sampleDocument(), registry)

    expect(outcome.document.version).toBe("2.0.0")
    expect(outcome.document.settings.customCss).toBe("ab")
    expect(outcome.applied).toEqual(["1.0.0 → 1.1.0", "1.1.0 → 2.0.0"])
  })

  it("leaves the document it was given alone", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)
    const registry = new MigrationRegistry("2.0.0", [
      step("1.0.0", "1.1.0", "a"),
      step("1.1.0", "2.0.0", "b"),
    ])

    migrate(document, registry)

    expect(JSON.stringify(document)).toBe(before)
  })

  it("sets the version even when a migration forgets to", () => {
    const forgetful = {
      from: "1.0.0",
      to: "1.1.0",
      migrate: (document: CheckoutSchema) => document,
    }

    expect(
      migrate(sampleDocument(), new MigrationRegistry("1.1.0", [forgetful])).document.version,
    ).toBe("1.1.0")
  })

  it("rejects a version it has no route from, and says what it knows", () => {
    const registry = new MigrationRegistry("2.0.0", [step("1.5.0", "2.0.0", "a")])

    expect(() => migrate({ ...sampleDocument(), version: "0.9.0" }, registry)).toThrow(/1\.5\.0/)
  })

  it("says so plainly when it knows no versions at all", () => {
    expect(() =>
      migrate({ ...sampleDocument(), version: "0.9.0" }, new MigrationRegistry("2.0.0")),
    ).toThrow(/none/)
  })

  // Never partially applied: a newer document is refused before anything runs.
  it("rejects a document newer than it can read", () => {
    const registry = new MigrationRegistry("1.0.0", [step("1.0.0", "1.1.0", "a")])

    expect(() => migrate({ ...sampleDocument(), version: "3.0.0" }, registry)).toThrow(
      /Update to open it/,
    )
  })

  it("carries the versions on the error", () => {
    const registry = new MigrationRegistry("1.0.0")

    try {
      migrate({ ...sampleDocument(), version: "3.0.0" }, registry)
      expect.unreachable("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError)
      expect(error).toMatchObject({ from: "3.0.0", to: "1.0.0", name: "MigrationError" })
    }
  })
})

describe("canMigrate", () => {
  const registry = new MigrationRegistry("2.0.0", [
    { from: "1.0.0", to: "2.0.0", migrate: (document) => document },
  ])

  it("says yes for a version it has a route from", () => {
    expect(canMigrate("1.0.0", registry)).toBe(true)
    expect(canMigrate("2.0.0", registry)).toBe(true)
  })

  it("says no for an unknown older version", () => {
    expect(canMigrate("0.5.0", registry)).toBe(false)
  })

  it("says no for a newer version", () => {
    expect(canMigrate("3.0.0", registry)).toBe(false)
  })
})
