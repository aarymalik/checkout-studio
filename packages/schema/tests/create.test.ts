import { describe, expect, it } from "vitest"

import { CURRENT_VERSION, ROOT_TYPE, createDocument, rehome } from "../src/document/create"
import { validate } from "../src/document/validate"
import { sampleDocument, sequentialRandom } from "./support"

/**
 * A new page.
 *
 * One root and nothing else. A page that arrives with a heading and a button
 * somebody did not ask for is a page they have to empty before they can start.
 */

describe("createDocument", () => {
  const made = () =>
    createDocument({
      projectId: "prj_one",
      pageId: "pag_one",
      themeId: "theme_one",
      random: sequentialRandom(),
    })

  it("produces a document that validates", () => {
    expect(validate(made()).valid).toBe(true)
  })

  it("has exactly one node, and it is the root", () => {
    const document = made()

    expect(Object.keys(document.nodes)).toEqual([document.root])
    expect(document.nodes[document.root]?.type).toBe(ROOT_TYPE)
  })

  it("starts empty", () => {
    const document = made()

    expect(document.nodes[document.root]?.children).toEqual([])
    expect(document.settings).toEqual({})
    expect(document.variables).toEqual({})
  })

  it("names the project, the page and the theme it belongs to", () => {
    expect(made()).toMatchObject({
      projectId: "prj_one",
      pageId: "pag_one",
      theme: { themeId: "theme_one" },
      version: CURRENT_VERSION,
    })
  })

  it("gives the root a readable id", () => {
    expect(made().root).toMatch(/^page_/)
  })

  it("gives two pages different roots", () => {
    const one = createDocument({ projectId: "p", pageId: "a", themeId: "t" })
    const other = createDocument({ projectId: "p", pageId: "b", themeId: "t" })

    expect(one.root).not.toBe(other.root)
  })

  it("puts the root where nothing is above it", () => {
    const document = made()

    expect(document.nodes[document.root]?.parentId).toBeNull()
  })
})

describe("rehome", () => {
  /*
   * Node ids are kept: they are unique within a document, not across the
   * product, and regenerating them would cost a walk of the whole tree to
   * achieve nothing.
   */
  it("moves a document to another page, keeping its nodes", () => {
    const before = sampleDocument()
    const after = rehome(before, { pageId: "pag_copy" })

    expect(after.pageId).toBe("pag_copy")
    expect(after.nodes).toBe(before.nodes)
    expect(validate(after).valid).toBe(true)
  })

  it("moves it to another project when asked", () => {
    const after = rehome(sampleDocument(), { projectId: "prj_other", pageId: "pag_copy" })

    expect(after).toMatchObject({ projectId: "prj_other", pageId: "pag_copy" })
  })

  it("leaves the project alone when it is not given one", () => {
    const before = sampleDocument()

    expect(rehome(before, { pageId: "pag_copy" }).projectId).toBe(before.projectId)
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const json = JSON.stringify(document)

    rehome(document, { projectId: "prj_other", pageId: "pag_copy" })

    expect(JSON.stringify(document)).toBe(json)
  })
})
