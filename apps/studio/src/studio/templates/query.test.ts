import { describe, expect, it } from "vitest"

import { NO_FILTER, categoriesOf, isFiltered, narrow } from "./query"
import type { LibraryTemplate } from "./query"

/**
 * Narrowing the library.
 *
 * The list arrives as a prop and the filtering happens here, so these are
 * the whole of what the panel does to it: which templates a filter leaves,
 * in what order, and what the filter may offer.
 */

function template(over: Partial<LibraryTemplate> = {}): LibraryTemplate {
  return {
    id: "tpl_1",
    name: "Spring sale",
    category: "checkout",
    description: null,
    thumbnailUrl: null,
    tags: [],
    ...over,
  }
}

const LIBRARY: readonly LibraryTemplate[] = [
  template({ id: "a", name: "Spring sale", category: "checkout", tags: ["seasonal"] }),
  template({ id: "b", name: "Minimal", category: "checkout", description: "One column" }),
  template({ id: "c", name: "Upsell", category: "upsell", tags: ["cross-sell"] }),
]

describe("an untouched filter", () => {
  it("leaves everything", () => {
    expect(narrow(LIBRARY, NO_FILTER)).toEqual(LIBRARY)
  })

  it("is not a filter", () => {
    expect(isFiltered(NO_FILTER)).toBe(false)
  })

  it("is still not a filter when the box holds only spaces", () => {
    // An empty panel saying "nothing matched your search" over a search
    // nobody made would be a lie about why it is empty.
    expect(isFiltered({ search: "   ", category: null })).toBe(false)
    expect(narrow(LIBRARY, { search: "   ", category: null })).toEqual(LIBRARY)
  })
})

describe("searching", () => {
  it("matches a name, ignoring case", () => {
    expect(narrow(LIBRARY, { search: "SPRING", category: null }).map((t) => t.id)).toEqual(["a"])
  })

  it("matches a description", () => {
    expect(narrow(LIBRARY, { search: "one column", category: null }).map((t) => t.id)).toEqual([
      "b",
    ])
  })

  it("matches a tag", () => {
    expect(narrow(LIBRARY, { search: "seasonal", category: null }).map((t) => t.id)).toEqual(["a"])
  })

  it("matches a tag whole rather than partly", () => {
    /*
     * The server matches a tag with `has`, which is equality. Two places
     * answering "does this match" differently would mean narrowing a list
     * the server filtered drops rows it had just called matches.
     */
    expect(narrow(LIBRARY, { search: "season", category: null })).toEqual([])
  })

  it("leaves nothing when nothing matches", () => {
    expect(narrow(LIBRARY, { search: "nothing like this", category: null })).toEqual([])
  })
})

describe("choosing a category", () => {
  it("keeps only that one", () => {
    expect(narrow(LIBRARY, { search: "", category: "upsell" }).map((t) => t.id)).toEqual(["c"])
  })

  it("narrows with a search rather than instead of it", () => {
    const both = narrow(LIBRARY, { search: "minimal", category: "checkout" })

    expect(both.map((t) => t.id)).toEqual(["b"])
    expect(narrow(LIBRARY, { search: "minimal", category: "upsell" })).toEqual([])
  })
})

describe("the order", () => {
  it("is the one the list arrived in", () => {
    /*
     * Newest first is the server's decision. A filter that also reordered
     * would move things under the cursor of somebody who was only
     * narrowing.
     */
    expect(narrow(LIBRARY, { search: "", category: "checkout" }).map((t) => t.id)).toEqual([
      "a",
      "b",
    ])
  })
})

describe("the categories a filter may offer", () => {
  it("are the ones present, each once", () => {
    expect(categoriesOf(LIBRARY)).toEqual(["checkout", "upsell"])
  })

  it("are in alphabetical order, not the order they turned up in", () => {
    /*
     * A filter whose options moved as the library grew would be a list
     * somebody has to re-read every time. The fixture above is already
     * alphabetical by accident of its order, so this one is not.
     */
    const jumbled = [
      template({ id: "x", category: "upsell" }),
      template({ id: "y", category: "abandoned-cart" }),
      template({ id: "z", category: "checkout" }),
    ]

    expect(categoriesOf(jumbled)).toEqual(["abandoned-cart", "checkout", "upsell"])
  })

  it("are of the whole library, not of what a filter left", () => {
    // A filter that narrowed its own options would leave somebody who
    // picked one with no way back to the others.
    const filtered = narrow(LIBRARY, { search: "", category: "upsell" })

    expect(categoriesOf(LIBRARY)).toEqual(["checkout", "upsell"])
    expect(categoriesOf(filtered)).toEqual(["upsell"])
  })

  it("are none for an empty library", () => {
    expect(categoriesOf([])).toEqual([])
  })
})
