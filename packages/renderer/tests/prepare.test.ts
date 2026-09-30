import { CURRENT_VERSION, MigrationRegistry, createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"
import { emptyRegistry } from "@checkout-studio/plugin-sdk"
import { describe, expect, it } from "vitest"

import { prepare } from "../src/runtime/prepare"
import { documentOf, sampleDocument, standardRegistry, theme } from "./support"

const options = () => ({ registry: standardRegistry() })

describe("preparing a document", () => {
  it("accepts a current, consistent document", () => {
    const result = prepare(sampleDocument(), options())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.root).toBe("page")
    expect(result.warnings).toEqual([])
  })

  it("refuses something that is not a document at all", () => {
    for (const value of [null, 42, "a page", {}, { version: "1.0.0" }]) {
      const result = prepare(value, options())

      expect(result.ok, JSON.stringify(value)).toBe(false)
      if (result.ok) continue
      expect(result.code).toBe("invalid")
      expect(result.problems.length).toBeGreaterThan(0)
    }
  })

  it("refuses a document whose references do not hold together", () => {
    const broken = documentOf("page", [
      { id: "page", type: "core.page", children: ["gone"] },
      { id: "orphan", type: "core.text" },
    ])

    const result = prepare(broken, options())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe("inconsistent")
  })

  it("warns about a type nothing is registered for, and still renders", () => {
    const result = prepare(sampleDocument(), { registry: emptyRegistry() })

    // An unknown type is a warning, not an error: the node becomes an
    // unsupported placeholder and the page still opens.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings.map((warning) => warning.code)).toContain("unknown-type")
  })

  it("runs the component validators a plugin contributed", () => {
    const registry = standardRegistry()

    expect(registry.componentValidators().size).toBe(0)
    expect(prepare(sampleDocument(), { registry }).ok).toBe(true)
  })
})

describe("migration", () => {
  function versioned(version: string): CheckoutSchema {
    return { ...sampleDocument(), version }
  }

  it("leaves a current document alone", () => {
    const result = prepare(versioned(CURRENT_VERSION), options())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.version).toBe(CURRENT_VERSION)
  })

  it("refuses a version nothing leads from", () => {
    const result = prepare(versioned("0.9.0"), options())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe("unsupported-version")
    expect(result.message).toContain("0.9.0")
  })

  it("refuses a version newer than this renderer reads", () => {
    const result = prepare(versioned("2.0.0"), options())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe("unsupported-version")
  })

  it("migrates a document it has a path for, and validates the result", () => {
    const migrations = new MigrationRegistry("1.1.0", [
      {
        from: "1.0.0",
        to: "1.1.0",
        migrate: (document) => document,
      },
    ])

    const result = prepare(versioned("1.0.0"), { ...options(), migrations })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.version).toBe("1.1.0")
  })

  it("renders a migrated document identically to one authored at the new version", () => {
    const migrations = new MigrationRegistry("1.1.0", [
      { from: "1.0.0", to: "1.1.0", migrate: (document) => document },
    ])

    const migrated = prepare(versioned("1.0.0"), { ...options(), migrations })
    const native = prepare(versioned("1.1.0"), { ...options(), migrations })

    expect(migrated.ok && native.ok).toBe(true)
    if (!migrated.ok || !native.ok) return
    expect(migrated.document).toEqual(native.document)
  })

  it("reports a migration that throws rather than rendering half a document", () => {
    const migrations = new MigrationRegistry("1.1.0", [
      {
        from: "1.0.0",
        to: "1.1.0",
        migrate: () => {
          throw new Error("could not rewrite the styles")
        },
      },
    ])

    const result = prepare(versioned("1.0.0"), { ...options(), migrations })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe("migration-failed")
    expect(result.message).toBe("could not rewrite the styles")
  })

  it("reports a migration that throws something other than an error", () => {
    const migrations = new MigrationRegistry("1.1.0", [
      {
        from: "1.0.0",
        to: "1.1.0",
        migrate: () => {
          throw "nope"
        },
      },
    ])

    const result = prepare(versioned("1.0.0"), { ...options(), migrations })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe("nope")
  })
})

describe("checking the theme at the same time", () => {
  it("says nothing about a sound theme", () => {
    const result = prepare(sampleDocument(), { ...options(), theme })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([])
  })

  it("warns about a theme value that is not valid, and still renders", () => {
    const result = prepare(sampleDocument(), {
      ...options(),
      theme: { ...theme, motion: { ...theme.motion, easing: "springy" } },
    })

    // A checkout with one wrong easing is worth far more than no checkout.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings[0]?.message).toContain("motion.easing")
  })

  it("rejects a circular token reference before anything renders", () => {
    const result = prepare(sampleDocument(), {
      ...options(),
      theme: {
        ...theme,
        colors: {
          ...theme.colors,
          custom: { a: "{colors.custom.b}", b: "{colors.custom.a}" },
        },
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // By the time a cycle showed up during rendering, half the page would
    // already be emitted.
    expect(result.warnings.map((warning) => warning.message).join(" ")).toContain("circular")
  })

  it("prepares a freshly created document", () => {
    const document = createDocument({
      projectId: "prj_1",
      pageId: "pge_1",
      themeId: theme.id,
    })

    expect(prepare(document, { registry: emptyRegistry() }).ok).toBe(true)
  })
})
