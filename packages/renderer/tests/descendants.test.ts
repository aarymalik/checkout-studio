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

describe("rules that come from the node rather than the type", () => {
  /** A component whose rules are whatever its own prop says. */
  const SHEET = definition("core.sheet", {
    descendantStyles: (node) => node.props["styles"] as Record<string, Record<string, string>>,
  })

  function cssForTwo(): string {
    const registry = registryWith(definition("core.page"), SHEET)
    const schema = documentOf("root", [
      { id: "root", type: "core.page", children: ["one", "two"] },
      { id: "one", type: "core.sheet", props: { styles: { p: { color: "{colors.primary}" } } } },
      { id: "two", type: "core.sheet", props: { styles: { p: { color: "{colors.danger}" } } } },
    ])

    return buildStylesheet(contextFor(schema, { mode: "published", registry })).css
  }

  it("asks each node and writes each answer", () => {
    const css = cssForTwo()

    expect(css).toContain("var(--ck-color-primary)")
    expect(css).toContain("var(--ck-color-danger)")
  })

  it("scopes each to its own node, so one block cannot style another", () => {
    // The property that matters. Two Code Blocks on a page are two
    // stylesheets, and a merchant styling `p` in one is not styling the other.
    const targeting = selectors(cssForTwo()).filter((selector) => selector.endsWith(" p"))

    expect(targeting).toEqual([".checkout-root .ck-one p", ".checkout-root .ck-two p"])
  })

  it("carries no type class, because the node's own class is the scope", () => {
    expect(cssForTwo()).not.toContain("ck-t-core_sheet")
  })
})

describe("what a selector may be", () => {
  function cssWith(selector: string): string {
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

    return buildStylesheet(contextFor(schema, { mode: "published", registry })).css
  }

  /*
   * What keeps a rule inside its scope is the prefix, not the grammar. A
   * selector is emitted with the component's class in front of it, so the
   * most ambitious one still only matches a descendant of the component —
   * `*` is "everything in this block" and `:root` matches nothing at all.
   *
   * These are the selectors a person writes CSS with. The grammar started at
   * element names, because the only author was us; it widened when Code Block
   * began taking CSS from a merchant.
   */
  it.each([
    ["a child combinator", "h2 > span"],
    ["a universal selector", "*"],
    ["a class", ".lead"],
    ["a pseudo-class", "a:hover"],
    ["a descendant pair", "thead th"],
  ])("emits %s, scoped", (_name, selector) => {
    const emitted = selectors(cssWith(selector)).filter((part) => part.includes(selector))

    expect(emitted.length).toBeGreaterThan(0)

    for (const part of emitted) {
      expect(part.startsWith(".checkout-root .ck-t-core_sneaky ")).toBe(true)
    }
  })

  /*
   * What the grammar does have to stop is a selector leaving the rule. A `}`
   * closes the block and starts whatever follows at the top level of the
   * stylesheet, which is the one way a selector becomes CSS of its own — and
   * a backslash can encode the characters the scan looks for.
   */
  it.each([
    ["a closing brace, which would end the rule", "h2 { color: red } .ck-root"],
    ["an opening brace", "h2 {"],
    ["a semicolon", "h2; body"],
    ["an at-rule", "h2 @media print"],
    ["a backslash, which can encode the rest", "h2 \\7d body"],
    ["a quote", 'h2["x"]'],
    ["an attribute selector", "[data-stripe]"],
    ["a comment, which could carry the rest out", "h2 /* } */ span"],
    ["an unclosed parenthesis", "h2:nth-child(2"],
    ["a parenthesis that closes one that never opened", "h2:nth-child(2))"],
    ["nothing at all", "   "],
  ])("drops %s", (_name, selector) => {
    expect(cssWith(selector)).not.toContain("color: var(--ck-color-primary)")
  })

  it("cannot reach the page even when it names the page", () => {
    /*
     * `.checkout-root` is the checkout's own class, and a component asking for
     * it is a component asking to style the whole page. Prefixed like anything
     * else it becomes "an element with that class inside this block", which
     * is nothing — so the rule is emitted and reaches nothing, rather than
     * being a special case somebody has to remember to add.
     */
    const rule = selectors(cssWith(".checkout-root")).filter((part) =>
      part.endsWith(" .checkout-root"),
    )

    expect(rule).toEqual([".checkout-root .ck-t-core_sneaky .checkout-root"])
  })
})
