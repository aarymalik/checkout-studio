import { describe, expect, it } from "vitest"

import {
  MAX_EMBED_ORIGINS,
  companionOrigin,
  frameAncestors,
  parseEmbedOrigin,
  type EmbedMode,
} from "./origins"

/**
 * What may frame an embedded checkout.
 *
 * The refusals carry as much weight as the acceptances here: each one is a
 * way a payment page could end up framed by something that should not be
 * able to frame it, and the whole control is a single header built from
 * these strings.
 */

/** The common case: a live embed, which is what a merchant registers. */
function live(input: string) {
  return parseEmbedOrigin(input, "live")
}

function accepted(input: string, mode: EmbedMode = "live"): string {
  const result = parseEmbedOrigin(input, mode)

  if (!result.ok) throw new Error(`expected ${input} to be accepted, got ${result.reason}`)

  return result.origin
}

describe("a domain a merchant typed", () => {
  it("becomes an exact origin", () => {
    expect(accepted("https://shop.example.com")).toBe("https://shop.example.com")
  })

  it("takes https when no scheme was given, since that is the only one allowed", () => {
    expect(accepted("example.com")).toBe("https://example.com")
  })

  it("keeps a port that is not the default, and drops one that is", () => {
    expect(accepted("https://example.com:8443")).toBe("https://example.com:8443")
    expect(accepted("https://example.com:443")).toBe("https://example.com")
  })

  it("is lowercased, because a host is case-insensitive and a header is not", () => {
    expect(accepted("https://Shop.EXAMPLE.com")).toBe("https://shop.example.com")
  })

  it("is punycode for an international domain, which is what a browser sends", () => {
    expect(accepted("https://münchen.example")).toBe("https://xn--mnchen-3ya.example")
  })

  it("loses a trailing slash, so one domain is not stored as two rows", () => {
    expect(accepted("https://example.com/")).toBe(accepted("https://example.com"))
  })

  it("is trimmed, because a pasted domain brings whitespace with it", () => {
    expect(accepted("  https://example.com  ")).toBe("https://example.com")
  })
})

describe("a domain that cannot frame a checkout", () => {
  it("refuses a wildcard, whatever shape it takes", () => {
    for (const input of ["https://*.example.com", "*.example.com", "https://*"]) {
      expect(live(input)).toMatchObject({ ok: false, reason: "wildcard" })
    }
  })

  it("refuses http, because a payment page cannot be served in the clear", () => {
    expect(live("http://example.com")).toMatchObject({ ok: false, reason: "insecure" })
  })

  it("refuses http on localhost too, when the embed is live", () => {
    // The development exception is the mode's, not the hostname's. A live
    // embed naming localhost is a mistake worth refusing.
    expect(live("http://localhost:3000")).toMatchObject({ ok: false, reason: "insecure" })
  })

  it("refuses a scheme that is neither", () => {
    for (const input of ["ftp://example.com", "file:///etc/hosts", "data:text/html,x"]) {
      expect(live(input).ok).toBe(false)
    }
  })

  it("refuses anything that is more than an origin", () => {
    for (const input of [
      "https://example.com/checkout",
      "https://example.com?session=abc",
      "https://example.com#top",
      "https://user:secret@example.com",
    ]) {
      expect(live(input)).toMatchObject({ ok: false, reason: "not-bare" })
    }
  })

  it("refuses an empty field separately, so the message can say so", () => {
    expect(live("   ")).toMatchObject({ ok: false, reason: "empty" })
  })

  it("refuses what will not parse at all", () => {
    expect(live("https://").ok).toBe(false)
    expect(live(":::").ok).toBe(false)
  })

  it("explains itself in a sentence, for every refusal", () => {
    const refusals = [":::", "   ", "https://*.a.com", "http://a.com", "https://a.com/b"]

    for (const input of refusals) {
      const result = live(input)

      expect(result.ok).toBe(false)

      if (result.ok) continue

      // Addressed to the merchant registering a domain. A refusal that reads
      // like a parser's complaint is a support ticket.
      expect(result.message).toMatch(/^[A-Z].*\.$/u)
    }
  })
})

describe("a development embed", () => {
  it("accepts http on localhost, which is where a merchant tries it first", () => {
    expect(accepted("http://localhost:3000", "development")).toBe("http://localhost:3000")
    expect(accepted("http://127.0.0.1:3000", "development")).toBe("http://127.0.0.1:3000")
  })

  it("still refuses http anywhere else", () => {
    expect(parseEmbedOrigin("http://staging.example.com", "development")).toMatchObject({
      ok: false,
      reason: "insecure",
    })
  })
})

describe("the other spelling of a domain", () => {
  it("is the www for an apex", () => {
    expect(companionOrigin("https://example.com")).toBe("https://www.example.com")
  })

  it("is the apex for a www", () => {
    expect(companionOrigin("https://www.example.com")).toBe("https://example.com")
  })

  it("carries the port across, since both spellings are served the same way", () => {
    expect(companionOrigin("https://example.com:8443")).toBe("https://www.example.com:8443")
  })

  it("is nothing for a subdomain, which has no counterpart", () => {
    expect(companionOrigin("https://shop.example.com")).toBeNull()
  })

  it("is nothing where a public suffix would be needed to tell", () => {
    /*
     * Deliberate. Two labels is the test for an apex, so a domain under a
     * multi-label suffix is not offered a pairing. Missing a suggestion is a
     * minor annoyance; proposing `www.co.uk` inside a security control is
     * not. See the note on the function.
     */
    expect(companionOrigin("https://example.co.uk")).toBeNull()
  })

  it("is nothing for localhost", () => {
    expect(companionOrigin("http://localhost:3000")).toBeNull()
  })
})

describe("the frame-ancestors source list", () => {
  it("is every origin, space separated", () => {
    expect(frameAncestors(["https://a.example", "https://b.example"])).toBe(
      "https://a.example https://b.example",
    )
  })

  it("is 'none' when nothing is registered", () => {
    /*
     * Not an empty string. `frame-ancestors` with no sources is a syntax
     * error, and a browser discarding the malformed directive would leave
     * the page framable by anyone.
     */
    expect(frameAncestors([])).toBe("'none'")
  })

  it("does not repeat an origin", () => {
    expect(frameAncestors(["https://a.example", "https://a.example"])).toBe("https://a.example")
  })

  it("is the same string however the origins were ordered", () => {
    const one = frameAncestors(["https://b.example", "https://a.example"])
    const other = frameAncestors(["https://a.example", "https://b.example"])

    expect(one).toBe(other)
    // Asserted against the value, not just the agreement: two functions
    // returning the same wrong string would satisfy equality alone.
    expect(one).toBe("https://a.example https://b.example")
  })
})

describe("the ceiling on a list", () => {
  it("is a number the RFC named, so a reader does not have to guess", () => {
    expect(MAX_EMBED_ORIGINS).toBe(20)
  })
})
