import { describe, expect, it } from "vitest"

import { canonicalJson, equivalent, normalize } from "../src/document/normalize"
import { deserialize, serialize } from "../src/document/serialize"
import { MigrationRegistry } from "../src/migrate/registry"
import type { CheckoutSchema } from "../src/document/schema"
import { makeDocument, makeNode, sampleDocument, wideDocument, withNodeAt } from "./support"

/**
 * Canonical form and round-tripping.
 *
 * Two documents that describe the same page must produce the same bytes. Without
 * that, re-serialising an unedited document in a different key order looks like
 * an edit, and autosave writes on every open.
 */

describe("normalize", () => {
  it("sorts object keys", () => {
    const document = sampleDocument()
    const keys = Object.keys(normalize(document))

    expect(keys).toEqual([...keys].sort())
  })

  // `children` is the document's own statement about what comes first.
  it("never reorders an array", () => {
    const document = normalize(sampleDocument())

    expect(document.nodes["section"]?.children).toEqual(["heading", "text"])
  })

  it("is key-order independent", () => {
    const one = sampleDocument()
    const other: CheckoutSchema = {
      nodes: one.nodes,
      root: one.root,
      variables: one.variables,
      settings: one.settings,
      theme: one.theme,
      pageId: one.pageId,
      projectId: one.projectId,
      version: one.version,
    }

    expect(canonicalJson(one)).toBe(canonicalJson(other))
  })

  it("sorts nested keys too", () => {
    const document = withNodeAt(sampleDocument(), "heading", { props: { zebra: 1, alpha: 2 } })

    expect(JSON.stringify(normalize(document).nodes["heading"]?.props)).toBe(
      '{"alpha":2,"zebra":1}',
    )
  })

  // Dropping it here rather than letting JSON.stringify do it means the
  // in-memory canonical form and the bytes agree about what is in the document.
  it("drops undefined", () => {
    const document = {
      ...sampleDocument(),
      settings: { currency: undefined } as CheckoutSchema["settings"],
    }

    expect(Object.keys(normalize(document).settings)).toEqual([])
  })

  it("leaves null alone, because null is a value", () => {
    const document = withNodeAt(sampleDocument(), "heading", { props: { subtitle: null } })

    expect(normalize(document).nodes["heading"]?.props).toEqual({ subtitle: null })
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    normalize(document)

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("equivalent", () => {
  it("recognises the same page written differently", () => {
    const one = sampleDocument()
    const other = { ...one, theme: { themeId: one.theme.themeId } }

    expect(equivalent(one, other)).toBe(true)
  })

  it("notices a real change", () => {
    const one = sampleDocument()
    const other = withNodeAt(structuredClone(one), "heading", { props: { text: "Hi" } })

    expect(equivalent(one, other)).toBe(false)
  })

  it("notices a reorder", () => {
    const one = sampleDocument()
    const other = withNodeAt(structuredClone(one), "section", { children: ["text", "heading"] })

    expect(equivalent(one, other)).toBe(false)
  })
})

describe("round trip", () => {
  it("survives state → JSON → state exactly", () => {
    const document = sampleDocument()
    const result = deserialize(serialize(document))

    expect(result.ok).toBe(true)
    expect(result.ok && equivalent(result.document, document)).toBe(true)
  })

  it("survives a large document", () => {
    const document = wideDocument(2_000)
    const result = deserialize(serialize(document))

    expect(result.ok && Object.keys(result.document.nodes)).toHaveLength(2_001)
  })

  // The output is data. Anything else in it would not survive the database.
  it("emits no functions, class instances or DOM references", () => {
    const json = serialize(sampleDocument())

    expect(json).not.toMatch(/function|\[object |undefined/)
    expect(JSON.parse(json)).toEqual(JSON.parse(json))
  })
})

describe("deserialize", () => {
  it("accepts an object as readily as a string", () => {
    expect(deserialize(sampleDocument()).ok).toBe(true)
  })

  it("rejects text that is not JSON, and says why", () => {
    const result = deserialize("{ not json")

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.message).toMatch(/Not JSON/)
  })

  it("rejects a document with a broken reference", () => {
    const broken = makeDocument([makeNode("root", { type: "core.page", children: ["ghost"] })])

    expect(deserialize(broken).ok).toBe(false)
  })

  it("rejects a document with the wrong shape", () => {
    expect(deserialize({ version: "1.0.0" }).ok).toBe(false)
  })

  /*
   * Order matters. Checking references first would reject a document an older
   * version wrote correctly and the migration would have fixed.
   */
  it("migrates before checking references", () => {
    const stale = makeDocument([makeNode("root", { type: "core.page", children: ["ghost"] })])
    stale.version = "0.9.0"

    const registry = new MigrationRegistry("1.0.0", [
      {
        from: "0.9.0",
        to: "1.0.0",
        migrate: (document) => ({
          ...document,
          nodes: {
            ...document.nodes,
            ghost: makeNode("ghost", { type: "core.text", parentId: "root" }),
          },
        }),
      },
    ])

    const result = deserialize(stale, { registry })

    expect(result.ok).toBe(true)
    expect(result.ok && result.migration?.applied).toEqual(["0.9.0 → 1.0.0"])
  })

  it("reports a migration it cannot perform as a problem, not a crash", () => {
    const result = deserialize(
      { ...sampleDocument(), version: "0.1.0" },
      { registry: new MigrationRegistry("1.0.0") },
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.path).toBe("version")
  })

  /*
   * A migration comes from a caller and may throw anything — a string, an
   * object, nothing at all. Losing that to "[object Object]" is how a broken
   * migration becomes unexplainable.
   */
  it("reports what a migration threw, whatever it threw", () => {
    const thrower = (value: unknown) =>
      new MigrationRegistry("1.1.0", [
        {
          from: "1.0.0",
          to: "1.1.0",
          migrate: () => {
            throw value
          },
        },
      ])

    const fromString = deserialize(sampleDocument(), { registry: thrower("no can do") })
    const fromObject = deserialize(sampleDocument(), { registry: thrower({ odd: true }) })
    const fromError = deserialize(sampleDocument(), { registry: thrower(new Error("boom")) })

    expect(!fromString.ok && fromString.errors[0]?.message).toBe("no can do")
    expect(!fromObject.ok && fromObject.errors[0]?.message).toMatch(/without saying why/)
    expect(!fromError.ok && fromError.errors[0]?.message).toBe("boom")
  })

  it("reports no migration when it was given no registry", () => {
    const result = deserialize(sampleDocument())

    expect(result.ok && result.migration).toBeNull()
  })
})
