import { describe, expect, it } from "vitest"
import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutSchema, ComponentValidator, Node } from "@checkout-studio/schema"

import { readPageBundle } from "./read"
import type { Registry } from "./read"
import type { BundlePayload } from "../types"

/**
 * Where a stranger's file becomes a page.
 *
 * Integrity proved the file is intact and is one of ours. It proved nothing
 * about what is inside, so every field here arrives untrusted — and the
 * failures that matter are the ones a valid envelope can still carry: a
 * document with a cycle, an asset registry that is a string, a theme missing
 * half its colours.
 */

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "core.text",
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
    ...overrides,
  }
}

const DOCUMENT: CheckoutSchema = {
  version: "1.0.0",
  projectId: "redacted",
  pageId: "redacted",
  theme: { themeId: "theme_default" },
  settings: {},
  variables: {},
  root: "root",
  nodes: {
    root: node("root", { type: "core.page", children: ["copy"] }),
    copy: node("copy", { parentId: "root" }),
  },
}

const ASSET = {
  sourceId: "ast_hero",
  fileName: "hero.png",
  mimeType: "image/png",
  bytes: 2_048,
  sha256: "a".repeat(64),
  referencedBy: ["copy"],
}

const REGISTRY: Registry = {
  components: new Map<string, ComponentValidator>(),
  knownTypes: ["core.page", "core.text"],
}

function payload(over: Record<string, unknown> = {}): BundlePayload {
  return {
    page: { name: "Checkout", slug: "checkout" },
    document: DOCUMENT,
    theme: defaultTheme,
    assets: [ASSET],
    ...over,
  }
}

describe("a payload that is a page bundle", () => {
  it("comes back as typed parts", () => {
    const result = readPageBundle(payload(), REGISTRY)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(result.bundle.page).toEqual({ name: "Checkout", slug: "checkout" })
    expect(result.bundle.document.root).toBe("root")
    expect(result.bundle.theme?.id).toBe(defaultTheme.id)
    expect(result.bundle.assets).toEqual([ASSET])
    expect(result.bundle.unknownTypes).toEqual([])
  })

  it("carries no theme when the bundle carries none", () => {
    const result = readPageBundle(payload({ theme: undefined }), REGISTRY)

    expect(result.ok ? result.bundle.theme : "unset").toBeNull()
  })
})

describe("a payload that is not", () => {
  it.each([
    ["nothing at all", {}],
    ["no page", { document: DOCUMENT, theme: defaultTheme, assets: [] }],
    ["a page with no slug", { page: { name: "Checkout" }, document: DOCUMENT, assets: [] }],
    [
      "an asset registry that is a string",
      { page: { name: "a", slug: "a" }, document: DOCUMENT, assets: "none" },
    ],
    [
      "a field nobody put there",
      { page: { name: "a", slug: "a" }, document: DOCUMENT, assets: [], surprise: 1 },
    ],
  ])("is refused: %s", (_name, value) => {
    expect(readPageBundle(value as BundlePayload, REGISTRY)).toMatchObject({
      reason: "not-a-page-bundle",
    })
  })

  it("is refused for an asset entry that is missing its hash", () => {
    // The hash is what an importer deduplicates and verifies against. An
    // entry without one describes a file nothing can check.
    const { sha256, ...rest } = ASSET

    expect(sha256).toHaveLength(64)
    expect(readPageBundle(payload({ assets: [rest] }), REGISTRY)).toMatchObject({
      reason: "not-a-page-bundle",
    })
  })

  it("is refused for a hash that is not one", () => {
    expect(
      readPageBundle(payload({ assets: [{ ...ASSET, sha256: "nope" }] }), REGISTRY),
    ).toMatchObject({ reason: "not-a-page-bundle" })
  })
})

describe("the document inside", () => {
  it("is refused when it is not a document", () => {
    expect(readPageBundle(payload({ document: { version: "1.0.0" } }), REGISTRY)).toMatchObject({
      reason: "invalid-document",
    })
  })

  it("is refused when its tree does not hold together", () => {
    /*
     * A valid envelope can carry a document with a parent pointing at
     * nothing. Structural validation alone would not notice, which is why
     * the referential pass is part of the same step.
     */
    const dangling = {
      ...DOCUMENT,
      nodes: { root: node("root", { type: "core.page", children: ["gone"] }) },
    }
    const result = readPageBundle(payload({ document: dangling }), REGISTRY)

    expect(result).toMatchObject({ reason: "invalid-document" })
    expect(result.ok === false ? result.problems.map((p) => p.code) : []).toContain("missing-node")
  })

  it("is refused when a component's own rule rejects it", () => {
    // Property validation per component definition, which only the registry
    // can perform.
    const strict: Registry = {
      knownTypes: ["core.page", "core.text"],
      components: new Map<string, ComponentValidator>([
        ["core.text", () => "A text node needs text."],
      ]),
    }

    expect(readPageBundle(payload(), strict)).toMatchObject({ reason: "invalid-document" })
  })

  it("says what was wrong, for somebody repairing a file by hand", () => {
    const result = readPageBundle(payload({ document: { version: "1.0.0" } }), REGISTRY)

    expect(result.ok === false ? result.problems.length : 0).toBeGreaterThan(0)
  })
})

describe("a component type this installation does not have", () => {
  it("warns rather than refusing", () => {
    /*
     * The page still imports. The compatibility gate has already said which
     * plugins are missing, and refusing here would contradict it — leaving
     * somebody unable to open a bundle on the installation that needs it
     * most.
     */
    const result = readPageBundle(payload(), { ...REGISTRY, knownTypes: ["core.page"] })

    expect(result.ok).toBe(true)
    expect(result.ok ? result.bundle.unknownTypes : []).toEqual(["copy"])
  })

  it("is not warned about when the registry knows it", () => {
    expect(readPageBundle(payload(), REGISTRY).ok).toBe(true)
  })
})

describe("the theme inside", () => {
  it("is refused when it is not a theme", () => {
    const half = { ...defaultTheme, colors: { primary: "#fff" } }

    expect(readPageBundle(payload({ theme: half }), REGISTRY)).toMatchObject({
      reason: "invalid-theme",
    })
  })

  it("says what was wrong with it", () => {
    const result = readPageBundle(payload({ theme: "a theme, honestly" }), REGISTRY)

    expect(result).toMatchObject({ reason: "invalid-theme" })
    expect(result.ok === false ? result.problems.length : 0).toBeGreaterThan(0)
  })
})
