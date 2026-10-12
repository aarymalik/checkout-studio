import type { PropValue } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { codeBlock } from "../src/components/code-block/definition"
import { parseCss } from "../src/css/parse"
import { readRules } from "../src/css/rules"
import { serializeCss } from "../src/css/serialize"
import { parseHtml } from "../src/html/parse"
import { nodeOf, renderComponent } from "./support"

describe("parsing a stylesheet", () => {
  it("takes the rules a merchant writes", () => {
    const { rules } = parseCss(".lead { font-size: 18px; color: #333 }\np { margin-top: 0 }")

    expect(rules).toEqual([
      { selector: ".lead", declarations: { fontSize: "18px", color: "#333" } },
      { selector: "p", declarations: { marginTop: "0" } },
    ])
  })

  it("stores a property the way a document stores one", () => {
    // Every style in a document is camel-cased, and the engine's emitter
    // kebab-cases it on the way out. A stored `font-size` would be dropped
    // there, silently, with the block looking unstyled and nothing to read.
    const { rules } = parseCss("p { line-height: 1.6; -webkit-font-smoothing: antialiased }")

    expect(Object.keys(rules[0]?.declarations ?? {})).toEqual(["lineHeight", "WebkitFontSmoothing"])
  })

  it("keeps a custom property as it was written", () => {
    const { rules } = parseCss("p { --lead-size: 18px }")

    expect(rules[0]?.declarations).toEqual({ "--lead-size": "18px" })
  })

  it("ignores comments", () => {
    const { rules } = parseCss("/* a note */ p { color: red /* and another */ }")

    expect(rules).toEqual([{ selector: "p", declarations: { color: "red" } }])
  })
})

describe("what a stylesheet will not take", () => {
  it("refuses a media query, and keeps the rules around it", () => {
    /*
     * The query, not the rules inside it. The first version matched rules with
     * a pattern, which cannot see an at-rule: the body of `@media` holds
     * braces, so the outer block never matched and its inner rules were kept
     * — a query dropped and its rules applied at every width.
     */
    const { rules, removed } = parseCss(
      "p { color: red }\n@media (max-width: 40em) { p { color: blue } }",
    )

    expect(rules).toEqual([{ selector: "p", declarations: { color: "red" } }])
    expect(removed).toContain("@media")
  })

  it("refuses an import, which would fetch from an origin the CSP refuses", () => {
    const { rules, removed } = parseCss(
      '@import url("https://evil.example/x.css");\np { color: red }',
    )

    expect(rules).toEqual([{ selector: "p", declarations: { color: "red" } }])
    expect(removed).toContain("@import")
  })

  it.each([
    ["a font face, which loads from an origin", "@font-face { src: url(https://evil.example/f) }"],
    ["keyframes, whose names are global", "@keyframes spin { from { opacity: 0 } }"],
  ])("refuses %s", (_name, source) => {
    const { rules } = parseCss(source)

    expect(rules).toEqual([])
  })

  it("refuses a value carrying a brace out of its rule", () => {
    const { rules, removed } = parseCss("p { color: red } .x { background: } url(a) }")

    expect(
      rules.every((rule) => JSON.stringify(rule).includes("red") || rule.selector === "p"),
    ).toBe(true)
    expect(removed.length).toBeGreaterThan(0)
  })

  it("survives braces that do not balance", () => {
    expect(() => parseCss("p { color: red")).not.toThrow()
    expect(() => parseCss("} p { color: red }")).not.toThrow()
  })
})

describe("the editor's round trip", () => {
  it("parses its own output to the same rules", () => {
    const { rules } = parseCss(".lead { font-size: 18px }\nthead th { text-align: left }")

    expect(parseCss(serializeCss(rules)).rules).toEqual(rules)
  })

  it("writes a property back in the spelling a person uses", () => {
    expect(serializeCss(parseCss("p { font-size: 18px }").rules)).toContain("font-size: 18px")
  })
})

describe("reading what was stored", () => {
  function check(styles: unknown): string | null | undefined {
    return codeBlock.validate?.(
      nodeOf("core.code-block", { props: { styles: styles as PropValue } }),
      {} as never,
    )
  }

  it("accepts rules the parser made", () => {
    expect(check(parseCss("p { color: red }").rules)).toBeNull()
  })

  it("accepts a block nobody has styled yet", () => {
    expect(check(undefined)).toBeNull()
  })

  it("refuses a stylesheet stored as a string", () => {
    expect(check("p { color: red }")).toMatch(/not a list of rules/)
  })

  it("refuses a rule with no selector", () => {
    expect(check([{ declarations: { color: "red" } }])).toMatch(/no selector/)
  })

  it("refuses a declaration that is not a value", () => {
    expect(check([{ selector: "p", declarations: { color: 42 } }])).toMatch(/not a value/)
  })

  it("lets a later rule win, as a stylesheet does", () => {
    const { styles } = readRules([
      { selector: "p", declarations: { color: "red", margin: "0" } },
      { selector: "p", declarations: { color: "blue" } },
    ])

    expect(styles["p"]).toEqual({ color: "blue", margin: "0" })
  })
})

describe("Code Block", () => {
  it("renders its markup, like an HTML Block", () => {
    const { container } = renderComponent(codeBlock, {
      props: { content: parseHtml('<p class="lead">Pay today.</p>').content, styles: [] },
    })

    expect(container.querySelector("p")).toHaveClass("lead")
  })

  it("writes no style element of its own", () => {
    /*
     * The CSS is the engine's to write, scoped to this node's class. A
     * component writing its own `<style>` would be schema content reaching
     * the page without the selector and value checks the engine applies —
     * and the renderer writes raw markup in exactly one file, which is not
     * this one.
     */
    const { container } = renderComponent(codeBlock, {
      props: {
        content: parseHtml("<p>Pay today.</p>").content,
        styles: parseCss("p { color: red }").rules,
      },
    })

    expect(container.querySelector("style")).toBeNull()
  })

  it("hands the engine its own rules, over the theme's typography", () => {
    const styles = codeBlock.descendantStyles

    if (typeof styles !== "function") throw new Error("Code Block's rules come from its node.")

    const node = nodeOf("core.code-block", {
      props: {
        styles: parseCss(".lead { color: red } h2 { text-transform: uppercase }")
          .rules as unknown as PropValue,
      },
    })
    const emitted = styles(node)

    expect(emitted[".lead"]).toEqual({ color: "red" })

    /*
     * Layered, not replaced. A merchant writing `h2 { text-transform }` means
     * "and uppercase": replacing the map left the rule working and the
     * heading at body size, which reads as the theme being broken.
     */
    expect(emitted["h2"]).toMatchObject({
      textTransform: "uppercase",
      fontSize: "{typography.scale.h2.fontSize}",
    })
  })

  it("keeps a box in the editor when it is empty, so it can be selected", () => {
    const { container } = renderComponent(codeBlock, {
      props: { content: [], styles: [] },
      mode: "editor-preview",
    })

    expect(container.querySelector("[data-ck-empty-code]")).not.toBeNull()
  })
})
