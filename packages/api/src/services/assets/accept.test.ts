import { describe, expect, it } from "vitest"

import { acceptUpload } from "./accept"
import type { AcceptResult } from "./accept"

/**
 * The upload, turned into the bytes we will store.
 *
 * What these protect is that the caller never stores what it was handed. For a
 * vector the stored document is one this server wrote, and everything recorded
 * about the asset — the hash above all — describes that document rather than
 * the upload it came from.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>'

function svg(markup: string): AcceptResult {
  return acceptUpload({ bytes: new TextEncoder().encode(markup), fileName: "logo.svg" })
}

function accepted(result: AcceptResult) {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)

  return { ...result, text: new TextDecoder().decode(result.bytes) }
}

describe("a type that needs no rewriting", () => {
  it("passes the bytes through", () => {
    const result = accepted(acceptUpload({ bytes: PNG, fileName: "a.png" }))

    expect(result.bytes).toBe(PNG)
    expect(result.type.mimeType).toBe("image/png")
    expect(result.removed).toEqual([])
  })

  it("passes a refusal through unchanged", () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02])
    const result = acceptUpload({ bytes: elf, fileName: "a.png" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unrecognised")
  })

  it("keeps the ceiling a refusal named", () => {
    const big = new Uint8Array(11_000_000)
    big.set(PNG, 0)

    const result = acceptUpload({ bytes: big, fileName: "a.png" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
    expect(result.limit).toBe(10_000_000)
  })

  it("honours a limit override", () => {
    expect(acceptUpload({ bytes: PNG, fileName: "a.png", limits: { image: 4 } }).ok).toBe(false)
  })
})

describe("a vector, which the boundary would not pass", () => {
  it("is accepted once it has been rewritten", () => {
    const result = accepted(svg(LOGO))

    expect(result.type.mimeType).toBe("image/svg+xml")
    expect(result.text).toContain('<path d="M4 4h16v16H4z"/>')
  })

  it("is stored as the document this server wrote, not the one that arrived", () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>`
    const result = accepted(svg(hostile))

    expect(result.text).not.toContain("script")
    expect(result.text).not.toContain("alert")
    expect(result.removed).toEqual(["script"])
  })

  it("reports what was taken out", () => {
    const result = accepted(
      svg('<svg xmlns="http://www.w3.org/2000/svg" onload="a()"><path d="M0 0"/></svg>'),
    )

    expect(result.removed).toEqual(["onload"])
  })

  it("hashes what is stored and not what was sent", () => {
    /*
     * The deduplication key has to name the file that exists. Hashing the
     * upload would key a document nobody has, and two uploads differing only
     * in a `<script>` would be two rows pointing at identical bytes.
     */
    // The same drawing, with a script in it. Identical in every other way, so
    // what is being compared is the effect of the script and nothing else.
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      "<script>alert(1)</script>" +
      '<path d="M4 4h16v16H4z"/></svg>'

    const clean = accepted(svg(LOGO))
    const scrubbed = accepted(svg(hostile))

    expect(scrubbed.sha256).toBe(clean.sha256)
    expect(scrubbed.text).toBe(clean.text)
  })

  it("measures the size of what is stored", () => {
    const result = accepted(svg(LOGO))

    expect(result.sizeBytes).toBe(result.bytes.length)
    expect(result.sizeBytes).not.toBe(new TextEncoder().encode(LOGO).length)
  })

  it("passes a sanitizing refusal on as its own reason", () => {
    const result = svg('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("doctype")
  })

  it("is still refused for size before anything is rewritten", () => {
    // The boundary's ceiling applies first, so a vector too big to store is
    // never parsed. Sanitizing it would be work done to reach a refusal.
    const padded = `${LOGO}${" ".repeat(1_000_001)}`

    const result = svg(padded)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
  })

  it("refuses a name that is not a name, before sanitizing", () => {
    const result = acceptUpload({
      bytes: new TextEncoder().encode(LOGO),
      fileName: "../../logo.svg",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unsafe-name")
  })

  it("trims the name, as the boundary would have", () => {
    const result = accepted(
      acceptUpload({ bytes: new TextEncoder().encode(LOGO), fileName: "  logo.svg  " }),
    )

    expect(result.fileName).toBe("logo.svg")
  })
})
