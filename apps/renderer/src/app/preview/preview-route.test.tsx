import { describe, expect, it } from "vitest"

import { dynamic } from "./[token]/page"

/**
 * That a preview is never served from a cache.
 *
 * Asserted against the route's own declaration rather than against a
 * response header. A development server answers `no-store` whatever the
 * route says, so an end-to-end header check passes with this deleted —
 * which is what it did, until a mutation pointed it out.
 *
 * What it protects: a published page is immutable at a revision and can
 * be cached hard, while a draft is whatever it is this second. A cached
 * preview shows somebody a page the merchant has already moved past, and
 * the merchant has no way to know they are looking at it.
 */

describe("the preview route", () => {
  it("opts out of caching", () => {
    expect(dynamic).toBe("force-dynamic")
  })
})
