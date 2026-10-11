import { describe, expect, it } from "vitest"

import { relFor, safeHref } from "../src/href"

/**
 * The destination guard.
 *
 * It was written for Button and Link and tested beside them. It moved into the
 * SDK when HTML Block needed it — a plugin may not import another plugin, and
 * the alternative was a second copy of a security primitive, which is the one
 * that does not get the fix. Its tests moved with it.
 */

describe("the destination guard", () => {
  it("allows the four schemes a checkout has a reason to use", () => {
    for (const href of [
      "https://example.test/terms",
      "http://example.test",
      "mailto:help@example.test",
      "tel:+441234567890",
    ]) {
      expect(safeHref(href)).toBe(href)
    }
  })

  it("allows a relative path, a fragment and a query", () => {
    for (const href of ["/thanks", "#details", "?step=2"]) {
      expect(safeHref(href)).toBe(href)
    }
  })

  it("refuses a javascript: URL, which runs when somebody clicks it", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull()
    // Whitespace and case are not a disguise.
    expect(safeHref("  JavaScript:alert(1)")).toBeNull()
    expect(safeHref("java\tscript:alert(1)")).toBeNull()
  })

  it("refuses a data: URL, which opens a page the author wrote in our origin", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull()
  })

  it("refuses a protocol-relative URL, which is not the relative path it looks like", () => {
    // `//evil.example` is https://evil.example, not a path on this site.
    expect(safeHref("//evil.example/pay")).toBeNull()
  })

  it("refuses nothing at all", () => {
    expect(safeHref("")).toBeNull()
    expect(safeHref("   ")).toBeNull()
    expect(safeHref(undefined)).toBeNull()
    expect(safeHref(42)).toBeNull()
  })

  it("refuses an address the URL parser cannot read", () => {
    /*
     * `new URL` throws on a malformed host rather than returning something
     * falsy, and the catch is the only reason a bad paste is a refusal and
     * not a crash in the renderer. It had no test until this file moved into
     * a package that holds its coverage at 100%.
     */
    expect(safeHref("http://[")).toBeNull()
    expect(safeHref("https://exa mple.test")).toBeNull()
  })

  it("protects the page that opened a new tab", () => {
    /*
     * Without `noopener` the opened page can reach back through
     * `window.opener` and navigate the one that opened it — and the page it
     * would be replacing is a checkout.
     */
    expect(relFor("_blank")).toBe("noopener noreferrer")
    expect(relFor("_self")).toBeUndefined()
  })
})
