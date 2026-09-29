import { describe, expect, it } from "vitest"

import { parseDocument, validate, validateReferences } from "../src/document/validate"
import { UNSUPPORTED_TYPE } from "../src/document/schema"
import { makeDocument, makeNode, sampleDocument, withNodeAt } from "./support"

/**
 * Validation.
 *
 * Every problem must name the nodes it is about. "Invalid schema" is a message
 * nobody can act on, and a document with 2,000 nodes gives nobody a place to
 * start looking.
 */

function codes(problems: readonly { code: string }[]): string[] {
  return problems.map((problem) => problem.code)
}

describe("structure", () => {
  it("accepts a valid document", () => {
    expect(validate(sampleDocument()).valid).toBe(true)
  })

  it("fills in the defaults a node may omit", () => {
    const parsed = parseDocument({
      version: "1.0.0",
      projectId: "prj",
      pageId: "pag",
      theme: { themeId: "theme" },
      root: "root",
      nodes: { root: { id: "root", type: "core.page", parentId: null, children: [] } },
    })

    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.document.nodes["root"]).toMatchObject({
      props: {},
      styles: {},
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false },
    })
    expect(parsed.ok && parsed.document.settings).toEqual({})
  })

  it("rejects a document that is not an object", () => {
    expect(validate("nonsense").valid).toBe(false)
    expect(validate(null).valid).toBe(false)
    expect(validate(42).valid).toBe(false)
  })

  it("rejects a version that is not major.minor.patch", () => {
    const result = validate({ ...sampleDocument(), version: "one" })

    expect(result.valid).toBe(false)
    expect(result.errors[0]?.path).toBe("version")
  })

  it("rejects a type id that is not namespaced", () => {
    const document = sampleDocument()
    document.nodes["heading"] = { ...makeNode("heading"), type: "heading" }

    const result = validate(document)

    expect(result.valid).toBe(false)
    expect(result.errors[0]?.nodeIds).toEqual(["heading"])
  })

  // A path nobody reads becomes a node somebody can open.
  it("names the node a structural problem is inside", () => {
    const document = sampleDocument()
    ;(document.nodes["heading"] as { children: unknown }).children = "not an array"

    const result = validate(document)

    expect(result.errors[0]?.nodeIds).toEqual(["heading"])
    expect(result.errors[0]?.path).toBe("nodes.heading.children")
  })

  /*
   * Props hold nested structures — a list of features, a set of columns — so
   * the value schema is recursive. Nothing enters it without a nested value.
   */
  it("accepts nested prop values, references and all", () => {
    const document = withNodeAt(sampleDocument(), "heading", {
      props: {
        text: "Hello",
        level: 2,
        featured: true,
        subtitle: null,
        image: { $asset: "ast_9f2a" },
        name: { $var: "customer.firstName" },
        items: [{ label: "One", nested: { deep: ["a", 1, false, null] } }],
      },
    })

    expect(validate(document).valid).toBe(true)
  })

  it("rejects a reference that carries anything beyond its own key", () => {
    const document = withNodeAt(sampleDocument(), "heading", {
      props: { image: { $asset: "ast_9f2a", extra: true } },
    })

    expect(validate(document).valid).toBe(false)
  })

  it("rejects fields the schema does not define", () => {
    expect(validate({ ...sampleDocument(), surprise: true }).valid).toBe(false)
  })

  it("reports the document itself when the problem has no path", () => {
    const result = parseDocument(undefined)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.path).toBe("(root)")
  })
})

describe("references", () => {
  it("rejects a missing root", () => {
    const document = makeDocument([makeNode("a", { type: "core.page" })], "nowhere")

    expect(codes(validateReferences(document))).toContain("missing-root")
  })

  it("rejects a root with a parent", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page", parentId: "ghost", children: [] }),
    ])

    expect(codes(validateReferences(document))).toContain("root-has-parent")
  })

  it("rejects an orphan", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page" }),
      makeNode("lost", { type: "core.text" }),
    ])
    const problems = validateReferences(document)

    expect(codes(problems)).toContain("orphan")
    expect(problems.find((problem) => problem.code === "orphan")?.nodeIds).toEqual(["lost"])
  })

  it("rejects a circular parent chain", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page", children: ["a"] }),
      makeNode("a", { parentId: "b", children: ["b"] }),
      makeNode("b", { parentId: "a", children: ["a"] }),
    ])
    const problems = validateReferences(document)
    const cycle = problems.find((problem) => problem.code === "cycle")

    expect([...(cycle?.nodeIds ?? [])].sort()).toEqual(["a", "b"])
  })

  // A record cannot hold two entries under one key, so the duplicate that can
  // actually happen is a node whose id disagrees with where it is stored.
  it("rejects an id that disagrees with its key", () => {
    const document = withNodeAt(sampleDocument(), "heading", { id: "elsewhere" })

    const problems = validateReferences(document)

    expect(codes(problems)).toContain("id-mismatch")
    expect(problems[0]?.nodeIds).toEqual(["heading", "elsewhere"])
  })

  it("rejects a child that does not exist", () => {
    const document = withNodeAt(sampleDocument(), "section", { children: ["heading", "ghost"] })

    const problems = validateReferences(document)

    expect(codes(problems)).toContain("missing-node")
    expect(problems.find((problem) => problem.code === "missing-node")?.nodeIds).toEqual([
      "section",
      "ghost",
    ])
  })

  it("rejects a parent that does not exist", () => {
    const document = sampleDocument()
    document.nodes["orphaned"] = makeNode("orphaned", { parentId: "ghost" })

    expect(codes(validateReferences(document))).toContain("missing-parent")
  })

  it("rejects a child and parent that disagree", () => {
    const document = withNodeAt(sampleDocument(), "heading", { parentId: "footer" })

    expect(codes(validateReferences(document))).toContain("parent-mismatch")
  })

  it("names null when a claimed child says it has no parent", () => {
    const document = withNodeAt(sampleDocument(), "heading", { parentId: null })
    const problems = validateReferences(document)
    const mismatch = problems.find((problem) => problem.code === "parent-mismatch")

    expect(mismatch?.message).toContain("null")
  })

  it("rejects a node claimed by two parents", () => {
    const document = withNodeAt(sampleDocument(), "footer", { children: ["heading"] })

    const problems = validateReferences(document)
    const claimed = problems.find((problem) => problem.code === "multiple-parents")

    expect(claimed?.nodeIds).toContain("heading")
    expect(claimed?.nodeIds).toContain("section")
    expect(claimed?.nodeIds).toContain("footer")
  })

  // Without a root every node is unreachable, and saying so once per node helps
  // nobody find the actual problem.
  it("does not report every node as an orphan when the root is missing", () => {
    const document = makeDocument([makeNode("a"), makeNode("b")], "nowhere")

    expect(codes(validateReferences(document))).not.toContain("orphan")
  })

  it("reports one problem per cycle, not one per node hanging off it", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page", children: [] }),
      makeNode("a", { parentId: "b" }),
      makeNode("b", { parentId: "a" }),
      makeNode("c", { parentId: "a" }),
      makeNode("d", { parentId: "c" }),
    ])

    expect(codes(validateReferences(document)).filter((code) => code === "cycle")).toHaveLength(1)
  })

  it("accepts a deep valid tree", () => {
    expect(validateReferences(sampleDocument())).toEqual([])
  })
})

describe("component types", () => {
  const known = new Set(["core.page", "core.section", "core.heading", "core.text"])

  // A page that used a since-removed plugin still opens.
  it("reports an unknown type as a warning, never an error", () => {
    const document = withNodeAt(sampleDocument(), "heading", { type: "gone.widget" })

    const result = validate(document, { knownTypes: known })

    expect(result.valid).toBe(true)
    expect(result.warnings[0]).toMatchObject({ code: "unknown-type", nodeIds: ["heading"] })
  })

  it("says nothing about types when it was given no catalogue", () => {
    const document = withNodeAt(sampleDocument(), "heading", { type: "gone.widget" })

    expect(validate(document).warnings).toEqual([])
  })

  it("does not flag the type that unknown components load as", () => {
    const document = withNodeAt(sampleDocument(), "heading", { type: UNSUPPORTED_TYPE })

    expect(validate(document, { knownTypes: known }).warnings).toEqual([])
  })
})

describe("component rules", () => {
  it("runs the rule a component declares, for its own nodes only", () => {
    const seen: string[] = []
    const components = new Map([
      [
        "core.heading",
        (node: { id: string; props: Record<string, unknown> }) => {
          seen.push(node.id)

          return node.props["text"] === undefined ? "A heading needs text." : null
        },
      ],
    ])

    const result = validate(sampleDocument(), { components: components as never })

    expect(seen).toEqual(["heading"])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatchObject({ code: "component", nodeIds: ["heading"] })
  })

  it("accepts a document whose component rules all pass", () => {
    const components = new Map([["core.heading", () => null]])

    expect(validate(sampleDocument(), { components: components as never }).valid).toBe(true)
  })
})
