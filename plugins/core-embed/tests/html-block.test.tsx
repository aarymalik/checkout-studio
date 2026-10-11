import type { PropValue } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { htmlBlock } from "../src/components/html-block/definition"
import { parseHtml } from "../src/html/parse"
import { serializeHtml } from "../src/html/serialize"
import { MAX_DEPTH } from "../src/html/tree"
import type { HtmlNode } from "../src/html/tree"
import { nodeOf, renderComponent } from "./support"

/** The tree a merchant would have after typing this. */
function treeOf(source: string): HtmlNode[] {
  return parseHtml(source).content
}

describe("HTML Block", () => {
  it("renders the tree as elements", () => {
    const { container } = renderComponent(htmlBlock, {
      props: { content: treeOf("<p>Pay <strong>today</strong>.</p>") },
    })

    expect(container.querySelector("p")?.textContent).toBe("Pay today.")
    expect(container.querySelector("strong")?.textContent).toBe("today")
  })

  it("writes a class as a class, not as a React prop nobody reads", () => {
    const { container } = renderComponent(htmlBlock, {
      props: { content: treeOf('<p class="lead">Hello</p>') },
    })

    expect(container.querySelector("p")).toHaveClass("lead")
  })

  it("writes a table's spans as numbers", () => {
    const { container } = renderComponent(htmlBlock, {
      props: { content: treeOf('<table><tr><td colspan="2">Wide</td></tr></table>') },
    })

    expect(container.querySelector("td")?.getAttribute("colspan")).toBe("2")
  })

  it("renders nothing on a published page when it has no content", () => {
    const { container } = renderComponent(htmlBlock, { props: { content: [] } })

    expect(container).toBeEmptyDOMElement()
  })

  it("keeps a box in the editor when it has no content, so it can be selected", () => {
    const { container } = renderComponent(htmlBlock, {
      props: { content: [] },
      mode: "editor-preview",
    })

    expect(container.querySelector("[data-ck-empty-html]")).not.toBeNull()
  })
})

describe("what it refuses in a tree that did not come from the parser", () => {
  /*
   * These bypass the parser on purpose. It runs before storage, and what
   * reaches a renderer has been through a database, an import or a migration
   * since — so the question is what the reading side does on its own.
   */
  it("drops a tag that is not on the allowlist and keeps its words", () => {
    const { container } = renderComponent(htmlBlock, {
      props: {
        content: [{ tag: "script", children: [{ text: "alert(1)" }] }],
      },
    })

    expect(container.querySelector("script")).toBeNull()
    expect(container.textContent).toBe("alert(1)")
  })

  it("drops an attribute the element may not carry", () => {
    const { container } = renderComponent(htmlBlock, {
      props: { content: [{ tag: "p", attrs: { onclick: "steal()" }, children: [{ text: "x" }] }] },
    })

    expect(container.querySelector("p")?.getAttribute("onclick")).toBeNull()
  })

  it("checks a destination however it arrived", () => {
    const { container } = renderComponent(htmlBlock, {
      props: {
        content: [
          { tag: "a", attrs: { href: "javascript:alert(1)" }, children: [{ text: "Click" }] },
        ],
      },
    })

    expect(container.querySelector("a")?.getAttribute("href")).toBeNull()
    expect(container.querySelector("a")?.textContent).toBe("Click")
  })

  it("renders nothing for content that is not a tree", () => {
    const { container } = renderComponent(htmlBlock, { props: { content: "<p>Hello</p>" } })

    expect(container).toBeEmptyDOMElement()
  })
})

describe("validation, which is the same walk publishing runs", () => {
  /**
   * The node's own rule, as the publish path calls it.
   *
   * A validator is handed the document as well, for the rules that need one —
   * heading order is the example. This one reads a single node, so there is
   * nothing to give it.
   */
  function check(content: unknown): string | null | undefined {
    /*
     * `as PropValue`, which is the one cast in this file and is the point of
     * the test: these are values a document should not hold, and the type
     * that describes a document's props correctly refuses them. Getting them
     * past the compiler is how the runtime check gets something to refuse.
     */
    const props = { content: content as PropValue }

    return htmlBlock.validate?.(nodeOf("core.html-block", { props }), {} as never)
  }

  it("accepts a tree the parser made", () => {
    expect(check(treeOf("<p>Hi</p>"))).toBeNull()
  })

  it("accepts a block nobody has typed in yet", () => {
    expect(check(undefined)).toBeNull()
  })

  it("refuses markup stored as a string", () => {
    expect(check("<p>Hello</p>")).toMatch(/not a list of elements/)
  })

  it("says what it objected to, so a merchant can fix it", () => {
    expect(check([{ tag: "p", attrs: { id: "x" } }])).toBe("`p` may not carry `id`.")
  })

  it("reports a destination it will not use", () => {
    expect(check([{ tag: "a", attrs: { href: "javascript:alert(1)" } }])).toMatch(
      /destination that will not be used/,
    )
  })

  it("refuses a tag the allowlist does not have", () => {
    expect(check([{ tag: "script", children: [] }])).not.toBeNull()
  })

  it("refuses an attribute the element may not carry", () => {
    expect(check([{ tag: "p", attrs: { onclick: "steal()" } }])).not.toBeNull()
  })

  it("refuses text with fields hung off it", () => {
    expect(check([{ text: "Hello", tag: "script" }])).not.toBeNull()
  })

  it("refuses a tree nested deeper than anything should walk", () => {
    let content: HtmlNode[] = [{ text: "bottom" }]

    for (let depth = 0; depth < MAX_DEPTH + 5; depth += 1) {
      content = [{ tag: "div", children: content }]
    }

    expect(check(content)).toMatch(/too deeply/)
  })
})

describe("the editor's round trip", () => {
  it("shows back the markup that survived, not the markup that was pasted", () => {
    const source = '<p onclick="steal()">Pay <strong>today</strong></p><script>alert(1)</script>'

    expect(serializeHtml(treeOf(source))).toBe("<p>Pay <strong>today</strong></p>")
  })

  it("parses its own output to the same tree", () => {
    // The property that matters: an author who reopens a block and saves it
    // unchanged has changed nothing.
    const tree = treeOf('<ul class="x"><li>One</li><li>Two<br></li></ul>')

    expect(treeOf(serializeHtml(tree))).toEqual(tree)
  })

  it("writes text as text, so markup in a paragraph stays in the paragraph", () => {
    const tree = treeOf("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")

    expect(serializeHtml(tree)).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")
    expect(treeOf(serializeHtml(tree))).toEqual(tree)
  })
})
