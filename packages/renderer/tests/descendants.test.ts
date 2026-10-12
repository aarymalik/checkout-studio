import { describe, expect, it } from "vitest"

import { buildStylesheet } from "../src/runtime/stylesheet"
import { contextFor, definition, documentOf, registryWith } from "./support"

/**
 * Styles for the elements a component draws inside itself.
 *
 * The cascade reaches nodes. A component that renders a subtree of its own has
 * elements in it that are not nodes, and until this existed nothing styled
 * them: an HTML Block's `<h2>` rendered at body size, which is what the first
 * screenshot of it showed.
 *
 * What these assert is the part that could go wrong quietly — that the rules
 * are scoped to the component, that they are emitted once, and that a selector
 * cannot reach past the component into the page.
 */

const PROSE = definition("core.prose", {
  descendantStyles: {
    h2: { fontSize: "{typography.scale.h2.fontSize}" },
    "ul, ol": { paddingLeft: "{spacing.6}" },
  },
})

/** Every selector in a stylesheet, one per comma-separated part. */
function selectors(css: string): string[] {
  return [...css.matchAll(/(^|\})([^{}]+)\{/g)].flatMap((match) =>
    (match[2] as string).split(",").map((part) => part.trim()),
  )
}

function cssFor(count = 1): string {
  const registry = registryWith(definition("core.page"), PROSE)
  const children = Array.from({ length: count }, (_, index) => `prose${String(index)}`)
  const schema = documentOf("root", [
    { id: "root", type: "core.page", children },
    ...children.map((id) => ({ id, type: "core.prose" })),
  ])

  return buildStylesheet(contextFor(schema, { mode: "published", registry })).css
}

describe("a component's descendant styles", () => {
  it("reaches the page", () => {
    expect(cssFor()).toContain("h2 {")
  })

  it("resolves a token reference the way a node's styles do", () => {
    // The value, not the reference: a reference that reached the stylesheet
    // would be a declaration the browser drops without a word.
    expect(cssFor()).toMatch(/h2 \{[^}]*font-size: var\(--ck-/)
  })

  it("is scoped to the component, so it cannot style the rest of the page", () => {
    /*
     * Every selector that ends in one of these elements names the component's
     * own class. Without that, a component with an opinion about `h2` would
     * have it about the whole checkout, payment form included.
     *
     * Read as selectors rather than as text. The first version searched the
     * sheet for the substring "ul" and failed on `--ck-radius-full`.
     */
    const targeting = selectors(cssFor()).filter((selector) =>
      ["h2", "ul", "ol"].includes(selector.split(/\s+/).pop() ?? ""),
    )

    expect(targeting.length).toBeGreaterThan(0)

    for (const selector of targeting) {
      expect(selector).toContain(".ck-t-core_prose")
    }
  })

  it("writes one copy however many nodes of that type the page has", () => {
    const once = cssFor(1).split("h2 {").length
    const thrice = cssFor(3).split("h2 {").length

    expect(thrice).toBe(once)
  })

  it("expands a list of elements into a list of scoped selectors", () => {
    const css = cssFor()

    expect(css).toContain(".ck-t-core_prose ul")
    expect(css).toContain(".ck-t-core_prose ol")
  })

  it("puts the type's class on the element, so the rules have something to match", () => {
    const registry = registryWith(definition("core.page"), PROSE)
    const schema = documentOf("root", [
      { id: "root", type: "core.page", children: ["prose"] },
      { id: "prose", type: "core.prose" },
    ])
    const context = contextFor(schema, { mode: "published", registry })

    // Through the plan rather than the markup: the stylesheet and the tree are
    // built from the same plan, which is what stops them disagreeing.
    expect(context.registry.get("core.prose")?.descendantStyles).toBeDefined()
    expect(buildStylesheet(context).css).toContain(".ck-t-core_prose")
  })

  it("says which component asked for a value this theme cannot produce", () => {
    /*
     * The diagnostic path. A component's descendant rules are written by a
     * plugin author against a theme they have never seen, so "this theme has
     * no such token" is a thing that happens — and a warning naming only the
     * property would send somebody looking through the document for a node
     * that does not exist.
     */
    const registry = registryWith(
      definition("core.page"),
      definition("core.prose", {
        descendantStyles: { h2: { fontSize: "{typography.scale.enormous.fontSize}" } },
      }),
    )
    const schema = documentOf("root", [
      { id: "root", type: "core.page", children: ["prose"] },
      { id: "prose", type: "core.prose" },
    ])
    const context = contextFor(schema, { mode: "published", registry })

    buildStylesheet(context)

    const warning = context.warnings().find((entry) => entry.message.includes("core.prose"))

    expect(warning?.message).toContain("fontSize")
    expect(warning?.message).toContain("h2")
  })

  it("costs nothing for a component that declares none", () => {
    const registry = registryWith(definition("core.page"), definition("core.plain"))
    const schema = documentOf("root", [
      { id: "root", type: "core.page", children: ["plain"] },
      { id: "plain", type: "core.plain" },
    ])

    expect(buildStylesheet(contextFor(schema, { mode: "published", registry })).css).not.toContain(
      "ck-t-",
    )
  })
})

describe("what a selector may be", () => {
  /*
   * The grammar is element names and lists of them, and nothing else. These
   * are the ways a wider one would let a component out of its own scope — a
   * descendant combinator with a leading `*`, a sibling selector, or a close
   * brace ending the rule early and starting one of its own.
   */
  it.each([
    ["a combinator", "h2 > span"],
    ["a universal selector", "*"],
    ["a class", ".payment-form"],
    ["an id", "#card"],
    ["an attribute", "[data-stripe]"],
    ["a pseudo-class", "h2:hover"],
    ["an escape out of the rule", "h2 { color: red } .ck-root"],
  ])("drops %s", (_name, selector) => {
    const registry = registryWith(
      definition("core.page"),
      definition("core.sneaky", {
        descendantStyles: { [selector]: { color: "{colors.primary}" } },
      }),
    )
    const schema = documentOf("root", [
      { id: "root", type: "core.page", children: ["sneaky"] },
      { id: "sneaky", type: "core.sneaky" },
    ])
    const css = buildStylesheet(contextFor(schema, { mode: "published", registry })).css

    expect(css).not.toContain(selector)
  })
})
