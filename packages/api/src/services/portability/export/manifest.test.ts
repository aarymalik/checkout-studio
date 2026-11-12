import { describe, expect, it } from "vitest"
import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

import { readJsonBundle } from "../import/integrity"
import { toJsonBundle } from "./serialize/json"
import { pageManifest } from "./manifest"
import type { PageManifestInput } from "./manifest"

/**
 * The part an importer reads before it trusts anything else in the file.
 *
 * So what is proved here is mostly that it cannot lie: every number is taken
 * from the payload that travels rather than from something passed alongside
 * it, and the one field that identifies where the bundle came from identifies
 * it without saying.
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

function input(over: Partial<PageManifestInput> = {}): PageManifestInput {
  const document = over.document ?? DOCUMENT

  return {
    payload: { document, theme: defaultTheme },
    document,
    theme: defaultTheme,
    source: { projectId: "prj_real", pageId: "pag_real" },
    name: "Checkout",
    createdBy: { name: "Spring Sale Ltd" },
    createdAt: new Date("2026-11-12T09:00:00.000Z"),
    productVersion: "0.1.0",
    rendererVersion: "^0.1.0",
    plugins: [{ id: "core-layout", version: "^0.1.0", optional: false }],
    assets: [],
    ...over,
  }
}

describe("what the manifest says about the bundle", () => {
  it("is what a bundle of ours looks like", () => {
    const manifest = pageManifest(input())

    expect(manifest).toMatchObject({
      format: "checkout-studio/bundle",
      formatVersion: "1.0.0",
      kind: "page",
      name: "Checkout",
      tags: [],
      createdAt: "2026-11-12T09:00:00.000Z",
      createdBy: { name: "Spring Sale Ltd" },
      generator: { product: "checkout-studio", version: "0.1.0" },
    })
  })

  it("leaves out a description nobody wrote", () => {
    // An absent field and an empty string are different things, and a bundle
    // listing would print the second.
    expect("description" in pageManifest(input())).toBe(false)
    expect(pageManifest(input({ description: "The one with the upsell" }))).toMatchObject({
      description: "The one with the upsell",
    })
  })

  it("counts the nodes that travel, not the ones it was told about", () => {
    expect(pageManifest(input()).contents.totalNodes).toBe(2)
  })

  it("measures the bytes a reader actually receives", () => {
    /*
     * The canonical text is both what the checksum covers and what a JSON
     * bundle is written as. Measuring anything else would describe a file
     * nobody gets.
     */
    const manifest = pageManifest(input())
    const written = toJsonBundle({ manifest, payload: input().payload })

    expect(manifest.contents.uncompressedBytes).toBeGreaterThan(0)
    expect(manifest.contents.uncompressedBytes).toBeLessThan(written.length)
  })

  it("counts bytes and not characters", () => {
    /*
     * A merchant whose page is in Japanese writes three bytes per character.
     * Reporting the string's length would understate the file by a third,
     * and the spec sizes bundles — exports over 25 MB are generated
     * asynchronously — off exactly this number.
     */
    const japanese = {
      ...DOCUMENT,
      nodes: {
        ...DOCUMENT.nodes,
        copy: node("copy", { parentId: "root", props: { text: "안전하게 결제하세요" } }),
      },
    }
    const manifest = pageManifest(input({ document: japanese }))
    const text = JSON.stringify({ document: japanese, theme: defaultTheme })

    expect(manifest.contents.uncompressedBytes).toBeGreaterThan(text.length)
  })

  it("says whether it carries a theme, by looking", () => {
    const without = input({ payload: { document: DOCUMENT } })

    expect(pageManifest(input()).contents.theme).toBe(true)
    expect(pageManifest(without).contents.theme).toBe(false)
  })

  it("says whether the page has settings of its own", () => {
    const withSettings = { ...DOCUMENT, settings: { seo: { title: "Pay" } } }

    expect(pageManifest(input()).contents.settings).toBe(false)
    expect(pageManifest(input({ document: withSettings })).contents.settings).toBe(true)
  })

  it("carries no symbols and no sections, which is what a page bundle is", () => {
    // Not a gap. A section bundle holds a subtree and is a different kind.
    expect(pageManifest(input()).contents).toMatchObject({ symbols: [], sections: [] })
  })
})

describe("the requirements", () => {
  it("name the schema the document was written against, not this build", () => {
    /*
     * An importer decides from it whether a migration is needed. Reporting
     * the exporter's version would say every bundle is current.
     */
    const older = { ...DOCUMENT, version: "0.9.0" }

    expect(pageManifest(input({ document: older })).requires.schemaVersion).toBe("0.9.0")
  })

  it("are the component types the page uses", () => {
    expect(pageManifest(input()).requires.componentTypes).toEqual(["core.page", "core.text"])
  })

  it("carry the plugins they were given", () => {
    expect(pageManifest(input()).requires.plugins).toEqual([
      { id: "core-layout", version: "^0.1.0", optional: false },
    ])
  })

  it("include the fonts the theme binds", () => {
    expect(pageManifest(input()).requires.fonts).toEqual([
      { family: "Inter", source: "system", weights: [400, 500, 600, 700] },
    ])
  })
})

describe("the bundle id", () => {
  it("is the same every time the same page is exported", () => {
    // "Stable identifier, for deduplication and update detection" — which a
    // random one could not be.
    expect(pageManifest(input()).bundleId).toBe(pageManifest(input()).bundleId)
  })

  it("is not the same for a different page", () => {
    const other = input({ source: { projectId: "prj_real", pageId: "pag_other" } })

    expect(pageManifest(other).bundleId).not.toBe(pageManifest(input()).bundleId)
  })

  it("is not the same for the same page in a different project", () => {
    const other = input({ source: { projectId: "prj_other", pageId: "pag_real" } })

    expect(pageManifest(other).bundleId).not.toBe(pageManifest(input()).bundleId)
  })

  it("does not carry the ids it was made from", () => {
    /*
     * The whole manifest, not just the id. Redaction blanks these fields in
     * the payload, and a manifest that printed them would have undone it one
     * stage later.
     */
    const text = JSON.stringify(pageManifest(input()))

    expect(text).not.toContain("prj_real")
    expect(text).not.toContain("pag_real")
  })
})

describe("the checksum it writes down", () => {
  it("is one the importer agrees with", () => {
    // The manifest and the payload leave together, so the gate they meet on
    // the other side is the real test of this field.
    const manifest = pageManifest(input())
    const read = readJsonBundle(toJsonBundle({ manifest, payload: input().payload }))

    expect(read.ok).toBe(true)
  })

  it("changes when the payload does", () => {
    const edited = input({ payload: { document: DOCUMENT, theme: { id: "theirs" } } })

    expect(pageManifest(edited).checksum).not.toBe(pageManifest(input()).checksum)
  })
})
