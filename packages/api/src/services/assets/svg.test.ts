import { describe, expect, it } from "vitest"

import { sanitizeSvg } from "./svg"
import type { SvgResult } from "./svg"

/**
 * An uploaded SVG, rewritten as one we wrote.
 *
 * The tests that matter are not the ones checking a shape survives. They are
 * the ones checking that every way an SVG can carry script is gone from the
 * output — and the broad one at the end, which asserts it over every hostile
 * fixture at once rather than relying on somebody remembering to add a case.
 */

function run(markup: string): SvgResult {
  return sanitizeSvg(new TextEncoder().encode(markup))
}

function sanitized(markup: string) {
  const result = run(markup)

  if (!result.ok) throw new Error(`refused: ${result.reason}`)

  return { ...result, text: new TextDecoder().decode(result.bytes) }
}

function refusal(markup: string): string {
  const result = run(markup)

  if (result.ok) throw new Error("accepted, and should not have been")

  return result.reason
}

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  "<title>Acme</title>" +
  '<path d="M4 4h16v16H4z" fill="#4f46e5"/>' +
  "</svg>"

/** Every way an SVG is known to carry script or reach another origin. */
const HOSTILE: Readonly<Record<string, string>> = {
  script: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  scriptCased: '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>',
  onload: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>',
  onclick: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" onclick="alert(1)"/></svg>',
  onerrorImage:
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="x" onerror="alert(1)"/></svg>',
  javascriptHref: '<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>',
  dataHref: '<svg xmlns="http://www.w3.org/2000/svg"><use href="data:text/html,<script>"/></svg>',
  externalUse:
    '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="https://evil.test/x.svg#a"/></svg>',
  externalPaint:
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url(https://evil.test/a#b)"/></svg>',
  dataPaint:
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url(data:image/svg+xml,x)"/></svg>',
  foreignObject:
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="x"/></foreignObject></svg>',
  styleImport:
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.test/a.css);</style></svg>',
  styleAttribute:
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" style="background:url(https://evil.test/a)"/></svg>',
  animateHref:
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"><animate attributeName="href" to="javascript:alert(1)"/></use></svg>',
  setHref:
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"><set attributeName="href" to="javascript:alert(1)"/></use></svg>',
  feImage:
    '<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feImage href="https://evil.test/a"/></filter></svg>',
  anchor:
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>',
  handlerAttributeOnGroup:
    '<svg xmlns="http://www.w3.org/2000/svg"><g onmouseover="alert(1)"><path d="M0 0"/></g></svg>',
}

describe("a drawing that is fine", () => {
  it("keeps the shapes", () => {
    const { text } = sanitized(LOGO)

    expect(text).toContain('<path d="M4 4h16v16H4z" fill="#4f46e5"/>')
    expect(text).toContain("<title>Acme</title>")
  })

  it("keeps the view box, which is what makes it scale", () => {
    expect(sanitized(LOGO).text).toContain('viewBox="0 0 24 24"')
  })

  it("removes nothing from it", () => {
    expect(sanitized(LOGO).removed).toEqual([])
  })

  it("writes its own declaration and namespace", () => {
    // What is stored is this file's document, not the merchant's bytes.
    const { text } = sanitized('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')

    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it("asserts one namespace rather than carrying two", () => {
    const { text } = sanitized(
      '<svg xmlns="http://evil.test/ns" xmlns:xlink="http://evil.test/xlink"><path d="M0 0"/></svg>',
    )

    expect(text.match(/xmlns=/g)).toHaveLength(1)
    expect(text).not.toContain("evil.test")
  })

  it("keeps a gradient and the local reference to it", () => {
    const { text } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
        '<rect width="1" height="1" fill="url(#g)"/>' +
        "</svg>",
    )

    expect(text).toContain('fill="url(#g)"')
    expect(text).toContain('<linearGradient id="g">')
  })

  it("keeps a clip path and a local use", () => {
    const { text } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<clipPath id="c"><rect width="1" height="1"/></clipPath>' +
        '<use href="#c" clip-path="url(#c)"/>' +
        "</svg>",
    )

    expect(text).toContain('href="#c"')
    expect(text).toContain('clip-path="url(#c)"')
  })

  it("skips comments without losing what is around them", () => {
    const { text } = sanitized(
      '<!-- made by an exporter --><svg xmlns="http://www.w3.org/2000/svg">' +
        '<!-- a layer --><path d="M0 0"/></svg>',
    )

    expect(text).not.toContain("<!--")
    expect(text).toContain('<path d="M0 0"/>')
  })

  it("accepts the declaration an exporter writes", () => {
    expect(
      sanitized('<?xml version="1.0" encoding="UTF-8"?><svg><path d="M0 0"/></svg>').text,
    ).toContain("<path")
  })
})

describe("script, however it arrives", () => {
  it.each(Object.entries(HOSTILE))("neutralises %s", (_name, markup) => {
    const result = run(markup)

    // Either refused outright or rewritten. Both are safe; which one depends
    // on whether the construct is a document this parser will not read at all.
    if (!result.ok) return

    const text = new TextDecoder().decode(result.bytes).toLowerCase()

    expect(text).not.toContain("<script")
    expect(text).not.toContain("javascript:")
    expect(text).not.toContain("alert(")
    expect(text).not.toContain("evil.test")
    expect(text).not.toContain("onload")
    expect(text).not.toContain("onerror")
    expect(text).not.toContain("onclick")
    expect(text).not.toContain("onmouseover")
    expect(text).not.toContain("foreignobject")
    expect(text).not.toContain("@import")
    expect(text).not.toContain("data:")
  })

  it("drops a script with its content, which is the script", () => {
    const { text, removed } = sanitized(HOSTILE["script"] as string)

    expect(text).not.toContain("alert")
    expect(removed).toContain("script")
  })

  it("says a handler was taken out", () => {
    expect(sanitized(HOSTILE["onload"] as string).removed).toContain("onload")
  })

  it("keeps the shape a handler was attached to", () => {
    // The handler is the problem, not the path. Losing the drawing would be
    // the sanitizer deciding the upload was worthless.
    expect(sanitized(HOSTILE["onclick"] as string).text).toContain('<path d="M0 0"/>')
  })

  it("keeps the shapes inside an element it does not know", () => {
    const { text, removed } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg"><switch><path d="M0 0"/></switch></svg>',
    )

    expect(text).toContain('<path d="M0 0"/>')
    expect(removed).toEqual(["switch"])
  })
})

describe("reaching another origin", () => {
  it("drops an external use", () => {
    expect(sanitized(HOSTILE["externalUse"] as string).removed).toContain("xlink:href")
  })

  it("drops an external paint", () => {
    expect(sanitized(HOSTILE["externalPaint"] as string).removed).toContain("fill")
  })

  it("drops a paint whose url it cannot read", () => {
    // A `url(` this file does not understand is a value it will not write.
    const { removed } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url(  "/></svg>',
    )

    expect(removed).toContain("fill")
  })

  it("drops a paint where only one of two references is local", () => {
    const { removed } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url(#a) url(https://evil.test/b)"/></svg>',
    )

    expect(removed).toContain("fill")
  })

  it("keeps a plain colour, which has no url in it", () => {
    expect(sanitized(LOGO).text).toContain('fill="#4f46e5"')
  })

  it("keeps none and currentColor", () => {
    const { text } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="none" stroke="currentColor"/></svg>',
    )

    expect(text).toContain('fill="none"')
    expect(text).toContain('stroke="currentColor"')
  })

  it("drops a quoted external reference, which is the same reference", () => {
    const { removed } = sanitized(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url('https://evil.test/a')"/></svg>`,
    )

    expect(removed).toContain("fill")
  })
})

describe("documents this parser will not read", () => {
  it("refuses a DOCTYPE, which is how entity expansion arrives", () => {
    // The billion laughs attack, which never gets as far as expanding.
    const markup =
      '<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>' +
      '<svg xmlns="http://www.w3.org/2000/svg"><title>&b;</title></svg>'

    expect(refusal(markup)).toBe("doctype")
  })

  it("refuses a DOCTYPE whatever its case", () => {
    expect(refusal('<!doctype svg><svg><path d="M0 0"/></svg>')).toBe("doctype")
  })

  it("refuses an external entity, by refusing the DOCTYPE that declares it", () => {
    const markup =
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + "<svg><title>&x;</title></svg>"

    expect(refusal(markup)).toBe("doctype")
  })

  it("refuses CDATA, whose content bypasses escaping by definition", () => {
    expect(refusal("<svg><title><![CDATA[<script>alert(1)</script>]]></title></svg>")).toBe("cdata")
  })

  it("refuses CDATA in the prolog too", () => {
    expect(refusal('<![CDATA[x]]><svg><path d="M0 0"/></svg>')).toBe("cdata")
  })

  it("refuses a processing instruction that is not the declaration", () => {
    expect(refusal('<?php echo 1; ?><svg><path d="M0 0"/></svg>')).toBe("processing-instruction")
    expect(refusal('<svg><?php echo 1; ?><path d="M0 0"/></svg>')).toBe("processing-instruction")
  })

  it("refuses an entity it does not define", () => {
    expect(refusal("<svg><title>&nbsp;</title></svg>")).toBe("entity")
  })

  it("refuses an entity in an attribute value as well", () => {
    expect(refusal('<svg><path d="M0 0" fill="&custom;"/></svg>')).toBe("entity")
  })

  it("refuses an unquoted attribute value", () => {
    // Where "how far does this value reach" bugs live.
    expect(refusal("<svg><path d=M0 0 /></svg>")).toBe("malformed")
  })

  it("refuses an attribute with no value, which is HTML and not XML", () => {
    expect(refusal('<svg><path d="M0 0" hidden/></svg>')).toBe("malformed")
  })

  it("refuses tags that do not match", () => {
    expect(refusal('<svg><g><path d="M0 0"/></svg></g>')).toBe("malformed")
  })

  it("refuses an unterminated tag", () => {
    expect(refusal('<svg><path d="M0 0"')).toBe("malformed")
  })

  it("refuses an unterminated comment", () => {
    expect(refusal("<!-- never closed <svg/>")).toBe("malformed")
  })

  it("refuses a raw angle bracket inside an attribute value", () => {
    expect(refusal('<svg><path d="M0 0" fill="a<b"/></svg>')).toBe("malformed")
  })

  it("refuses something that is not UTF-8", () => {
    // A lone continuation byte, which no UTF-8 sequence begins with.
    expect(sanitizeSvg(new Uint8Array([0xff, 0xfe, 0x80, 0x80])).ok).toBe(false)
    expect(sanitizeSvg(new Uint8Array([0x80])).ok).toBe(false)
  })

  it("refuses nothing at all", () => {
    expect(refusal("")).toBe("not-text")
    expect(refusal("   \n  ")).toBe("not-text")
  })

  it.each([
    ["a bare ampersand, which is not well-formed", "<svg><title>a & b</title></svg>", "entity"],
    ["an unterminated declaration", '<?xml version="1.0"', "malformed"],
    ["an attribute name that is not a name", '<svg 1bad="x"/>', "malformed"],
    ["an unterminated attribute value", '<svg id="abc', "malformed"],
    ["text where an element should start", "hello", "malformed"],
    ["an element name that is not a name", "<1svg/>", "malformed"],
    ["a space before the element name", "< svg/>", "malformed"],
    ["a slash that does not close the tag", "<svg /x>", "malformed"],
    ["text that never reaches another tag", "<svg>text", "malformed"],
    ["a closing tag with no bracket", "<svg></svg", "malformed"],
    ["an unterminated comment inside an element", "<svg><!-- x", "malformed"],
    ["a doctype inside an element", "<svg><!DOCTYPE x></svg>", "doctype"],
    ["some other declaration inside an element", "<svg><!FOO></svg>", "malformed"],
  ])("refuses %s", (_name, markup, reason) => {
    expect(refusal(markup)).toBe(reason)
  })

  it("refuses a document whose root is not an svg", () => {
    expect(refusal("<html><body>hello</body></html>")).toBe("not-svg")
    expect(refusal("<div/>")).toBe("not-svg")
  })
})

describe("limits", () => {
  it("refuses nesting deeper than any drawing", () => {
    const deep = `<svg xmlns="http://www.w3.org/2000/svg">${"<g>".repeat(40)}${"</g>".repeat(40)}</svg>`

    expect(refusal(deep)).toBe("too-complex")
  })

  it("accepts nesting a real exporter produces", () => {
    const nested = `<svg xmlns="http://www.w3.org/2000/svg">${"<g>".repeat(20)}<path d="M0 0"/>${"</g>".repeat(20)}</svg>`

    expect(sanitized(nested).text).toContain("<path")
  })

  it("refuses more elements than a logo has", () => {
    const many = `<svg xmlns="http://www.w3.org/2000/svg">${'<path d="M0 0"/>'.repeat(10_001)}</svg>`

    expect(refusal(many)).toBe("too-complex")
  })
})

describe("what gets written", () => {
  it("escapes text, so a title cannot become markup", () => {
    const { text } = sanitized("<svg><title>5 &lt; 6 &amp; rising</title></svg>")

    expect(text).toContain("<title>5 &lt; 6 &amp; rising</title>")
    expect(text).not.toContain("<title>5 < 6")
  })

  it("escapes an attribute value", () => {
    const { text } = sanitized('<svg><path d="M0 0" id="a&amp;b"/></svg>')

    expect(text).toContain('id="a&amp;b"')
  })

  it("re-escapes a numeric reference rather than passing it through", () => {
    // Decoded while reading and escaped while writing, so a reference cannot
    // smuggle a character past the escaping step.
    const { text } = sanitized("<svg><title>&#60;b&#62;</title></svg>")

    expect(text).toContain("<title>&lt;b&gt;</title>")
  })

  it("refuses a numeric reference that is not a character", () => {
    expect(refusal("<svg><title>&#xD800;</title></svg>")).toBe("entity")
    expect(refusal("<svg><title>&#1114112;</title></svg>")).toBe("entity")
    expect(refusal("<svg><title>&#0;</title></svg>")).toBe("entity")
  })

  it("drops whitespace between elements rather than keeping it as text", () => {
    const { text } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg">\n  <path d="M0 0"/>\n</svg>',
    )

    expect(text).toContain('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')
  })

  it("closes an empty element in one tag", () => {
    expect(sanitized('<svg><path d="M0 0"></path></svg>').text).toContain('<path d="M0 0"/>')
  })

  it("reports what it removed, sorted and once each", () => {
    const { removed } = sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="a()">' +
        "<script>a()</script><script>b()</script>" +
        '<path d="M0 0" onclick="a()"/>' +
        "</svg>",
    )

    expect(removed).toEqual(["onclick", "onload", "script"])
  })

  it("produces output this sanitizer accepts unchanged", () => {
    // Idempotence. A second pass finding something to remove would mean the
    // first pass wrote something it would not accept.
    const once = sanitized(LOGO)
    const twice = sanitized(once.text)

    expect(twice.removed).toEqual([])
    expect(twice.text).toBe(once.text)
  })

  it("produces output it accepts for every hostile fixture too", () => {
    for (const markup of Object.values(HOSTILE)) {
      const first = run(markup)

      if (!first.ok) continue

      const again = sanitizeSvg(first.bytes)

      expect(again.ok).toBe(true)
      if (!again.ok) continue
      expect(again.removed).toEqual([])
    }
  })
})
