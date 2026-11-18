import { describe, expect, it } from "vitest"

import { templateQuery } from "./library"

/**
 * A query string as a query.
 *
 * Everything here arrives from a URL somebody typed or a crawler built, so
 * these are mostly about the two ways that goes wrong: a value that means
 * nothing being treated as a filter, and a value with no ceiling.
 */

const query = (search: string): URLSearchParams => new URLSearchParams(search)

describe("an empty query", () => {
  it("narrows nothing", () => {
    expect(templateQuery(query(""))).toEqual({})
  })

  it.each(["category=", "search=", "tags="])(
    "ignores %s, which is what a cleared box sends",
    (q) => {
      // Treating `?search=` as a search for nothing would answer with nothing,
      // which is the opposite of clearing a box.
      expect(templateQuery(query(q))).toEqual({})
    },
  )

  it("ignores a value that is only spaces", () => {
    expect(templateQuery(query("search=%20%20%20"))).toEqual({})
  })
})

describe("what it reads", () => {
  it("a category", () => {
    expect(templateQuery(query("category=checkout"))).toEqual({ category: "checkout" })
  })

  it("a search, trimmed", () => {
    expect(templateQuery(query("search=%20spring%20"))).toEqual({ search: "spring" })
  })

  it("tags, repeated rather than comma-separated", () => {
    /*
     * `?tags=a&tags=b` is what a form sends and what URLSearchParams builds,
     * and a comma is a character a tag is allowed to contain.
     */
    expect(templateQuery(query("tags=seasonal&tags=minimal"))).toEqual({
      tags: ["seasonal", "minimal"],
    })
  })

  it("a tag containing a comma, as one tag", () => {
    expect(templateQuery(query("tags=black%2C%20friday"))).toEqual({ tags: ["black, friday"] })
  })

  it("all three at once", () => {
    expect(templateQuery(query("category=checkout&search=sale&tags=seasonal"))).toEqual({
      category: "checkout",
      search: "sale",
      tags: ["seasonal"],
    })
  })
})

describe("the ceilings", () => {
  it("caps a search", () => {
    // An unbounded search is an unbounded LIKE.
    const long = "x".repeat(500)
    const result = templateQuery(query(`search=${long}`))

    expect(result.search).toHaveLength(200)
  })

  it("caps the number of tags", () => {
    // A thousand tags is a thousand array containments.
    const many = Array.from({ length: 50 }, (_, index) => `tags=t${String(index)}`).join("&")

    expect(templateQuery(query(many)).tags).toHaveLength(10)
  })

  it("caps a tag", () => {
    const result = templateQuery(query(`tags=${"y".repeat(200)}`))

    expect(result.tags?.[0]).toHaveLength(50)
  })

  it("caps a category", () => {
    expect(templateQuery(query(`category=${"z".repeat(200)}`)).category).toHaveLength(50)
  })

  it("drops a tag that was only spaces, keeping the rest", () => {
    expect(templateQuery(query("tags=a&tags=%20%20&tags=b"))).toEqual({ tags: ["a", "b"] })
  })
})
