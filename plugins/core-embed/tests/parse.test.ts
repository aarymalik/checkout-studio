import { describe, expect, it } from "vitest"

import { readContent } from "../src/html/content"
import { parseHtml } from "../src/html/parse"
import { MAX_DEPTH } from "../src/html/tree"

/**
 * The tree, read back as well.
 *
 * `readContent` is what the renderer and publishing both run, so a parser that
 * produced something it objects to would be a block that saves and then will
 * not render. Asserting it here is what keeps the two from drifting.
 */
function parse(source: string): ReturnType<typeof parseHtml> {
  const result = parseHtml(source)
  const read = readContent(result.content)

  expect(read.problem).toBeNull()
  expect(read.content).toEqual(result.content)

  return result
}

describe("parsing markup", () => {
  it("keeps the text markup a merchant writes copy with", () => {
    const { content } = parse("<p>Pay <strong>today</strong> and save.</p>")

    expect(content).toEqual([
      {
        tag: "p",
        children: [
          { text: "Pay " },
          { tag: "strong", children: [{ text: "today" }] },
          { text: " and save." },
        ],
      },
    ])
  })

  it("keeps a link, its target, and the rel that target needs", () => {
    const { content } = parse('<a href="https://example.com" target="_blank">Terms</a>')

    expect(content).toEqual([
      {
        tag: "a",
        attrs: { href: "https://example.com", target: "_blank", rel: "noopener noreferrer" },
        children: [{ text: "Terms" }],
      },
    ])
  })

  it("keeps the class a Code Block's CSS would reach", () => {
    const { content } = parse('<p class="lead">Hello</p>')

    expect(content).toEqual([{ tag: "p", attrs: { class: "lead" }, children: [{ text: "Hello" }] }])
  })
})

describe("what it will not keep", () => {
  it("drops a script and the script with it", () => {
    const { content, removed } = parse("<p>Before</p><script>alert(1)</script><p>After</p>")

    expect(content).toEqual([
      { tag: "p", children: [{ text: "Before" }] },
      { tag: "p", children: [{ text: "After" }] },
    ])
    expect(removed).toContain("script")
  })

  it("drops an event handler and keeps the element", () => {
    const { content, removed } = parse('<p onclick="steal()">Click</p>')

    expect(content).toEqual([{ tag: "p", children: [{ text: "Click" }] }])
    expect(removed).toContain("onclick")
  })

  it("drops a javascript: destination and leaves an anchor going nowhere", () => {
    // Nowhere rather than removed: the words are the author's, and a link
    // that does nothing is recoverable in a way one that runs a script is not.
    const { content, removed } = parse('<a href="javascript:alert(1)">Click</a>')

    expect(content).toEqual([{ tag: "a", children: [{ text: "Click" }] }])
    expect(removed).toContain("href")
  })

  it.each([
    ["an iframe", '<iframe src="https://evil.example"></iframe>', "iframe"],
    ["an object", '<object data="x.swf"></object>', "object"],
    ["an inline style sheet", "<style>body{display:none}</style>", "style"],
    ["an image, which has no allowed source", '<img src="https://evil.example/x.png">', "img"],
    ["a form field", '<input name="card">', "input"],
    ["an SVG, which carries its own script surface", '<svg><use href="#x"/></svg>', "svg"],
  ])("drops %s", (_name, source, reported) => {
    const { content, removed } = parse(source)

    expect(content).toEqual([])
    expect(removed).toContain(reported)
  })

  it("drops a style attribute, because style is the cascade's", () => {
    const { content, removed } = parse('<p style="position:fixed;inset:0">Over everything</p>')

    expect(content).toEqual([{ tag: "p", children: [{ text: "Over everything" }] }])
    expect(removed).toContain("style")
  })

  it("drops an id, which is page-global", () => {
    const { removed } = parse('<p id="email">Hello</p>')

    expect(removed).toContain("id")
  })

  it("keeps the words inside a tag it does not know", () => {
    const { content, removed } = parse("<marquee>Sale</marquee>")

    expect(content).toEqual([{ text: "Sale" }])
    expect(removed).toContain("marquee")
  })

  it("refuses a target it does not understand", () => {
    const { content } = parse('<a href="/terms" target="_top">Terms</a>')

    expect(content).toEqual([
      { tag: "a", attrs: { href: "/terms" }, children: [{ text: "Terms" }] },
    ])
  })

  it("will not take a rel the author wrote", () => {
    // An anchor staying in this tab has nothing for `noopener` to act on, and
    // one leaving gets the rel above whatever it arrived with.
    const { content } = parse('<a href="/terms" rel="opener">Terms</a>')

    expect(content).toEqual([
      { tag: "a", attrs: { href: "/terms" }, children: [{ text: "Terms" }] },
    ])
  })

  it("refuses a span count that is not a count", () => {
    const { content } = parse('<table><tr><td colspan="1e9">Wide</td></tr></table>')
    const table = content[0]

    expect(JSON.stringify(table)).not.toContain("colspan")
  })

  it("stops at the depth limit rather than walking a hand-built document", () => {
    const deep = "<div>".repeat(MAX_DEPTH + 10) + "bottom" + "</div>".repeat(MAX_DEPTH + 10)
    const { removed } = parse(deep)

    expect(removed.some((entry) => entry.startsWith("nesting deeper"))).toBe(true)
  })
})

describe("what the browser's parser does that a regex would not", () => {
  it("is not fooled by a tag name split by a comment", () => {
    // The browser reads this as text, not as a script with a comment in its
    // name — so the tree holds the characters and no element at all. A filter
    // that looked for `<script` in the source would have passed it through.
    const { content } = parse("<scr<!---->ipt>alert(1)</script>")

    expect(content.every((node) => "text" in node)).toBe(true)
  })

  it("is not fooled by an unclosed attribute quote", () => {
    const { content } = parse('<p class="a onclick="steal()">Hello</p>')

    expect(JSON.stringify(content)).not.toContain("steal")
  })

  it("treats a mixed-case tag as the tag it is", () => {
    const { removed } = parse("<ScRiPt>alert(1)</ScRiPt>")

    expect(removed).toContain("script")
  })

  it("keeps an escaped angle bracket as text", () => {
    const { content } = parse("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")

    expect(content).toEqual([{ tag: "p", children: [{ text: "<script>alert(1)</script>" }] }])
  })
})
