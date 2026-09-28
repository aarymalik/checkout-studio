import { describe, expect, it } from "vitest"

import { fuzzyMatch } from "../../src/commands/fuzzy"

function score(haystack: string, needle: string): number {
  const match = fuzzyMatch(haystack, needle)

  expect(match, `"${needle}" should match "${haystack}"`).not.toBeNull()

  return (match as { score: number }).score
}

describe("fuzzyMatch", () => {
  it("matches a prefix", () => {
    expect(fuzzyMatch("Duplicate", "dup")?.indices).toEqual([0, 1, 2])
  })

  it("matches characters spread through the candidate", () => {
    expect(fuzzyMatch("Duplicate", "dpe")?.indices).toEqual([0, 2, 8])
  })

  it("ignores case in both directions", () => {
    expect(fuzzyMatch("duplicate", "DUP")).not.toBeNull()
    expect(fuzzyMatch("DUPLICATE", "dup")).not.toBeNull()
  })

  it("does not match characters out of order", () => {
    expect(fuzzyMatch("Duplicate", "pud")).toBeNull()
  })

  it("does not match a character that is not there", () => {
    expect(fuzzyMatch("Duplicate", "dupz")).toBeNull()
  })

  it("does not match a query longer than the candidate", () => {
    expect(fuzzyMatch("Cut", "cutting")).toBeNull()
  })

  it("matches everything on an empty query, so an unfiltered palette lists all", () => {
    expect(fuzzyMatch("Duplicate", "")).toEqual({ score: 0, indices: [] })
  })

  describe("ranking", () => {
    it("prefers a prefix over a match in the middle", () => {
      expect(score("Group", "gr")).toBeGreaterThan(score("Ungroup", "gr"))
    })

    it("prefers a contiguous run over a scattered one", () => {
      expect(score("Duplicate", "dup")).toBeGreaterThan(score("Delete Up", "dup"))
    })

    it("prefers a word start over the middle of a word", () => {
      expect(score("Send Backward", "b")).toBeGreaterThan(score("Publish", "b"))
    })

    it("prefers the shorter of two candidates that match the same way", () => {
      expect(score("Group", "group")).toBeGreaterThan(score("Group selection", "group"))
    })

    // A capital after a lowercase starts a word, which matters for ids and for
    // plugin-supplied titles.
    it("treats a camel-case hump as a word start", () => {
      expect(score("docGrid", "g")).toBeGreaterThan(score("aaagaa", "g"))
    })

    it("treats a hyphen, a dot and an underscore as word breaks", () => {
      for (const candidate of ["send-backward", "send.backward", "send_backward"])
        expect(score(candidate, "b")).toBeGreaterThan(score("publish", "b"))
    })

    it("keeps a short exact match above a long incidental one", () => {
      expect(score("Duplicate", "dup")).toBeGreaterThan(score("Delete the duplicated group", "dup"))
    })
  })
})
