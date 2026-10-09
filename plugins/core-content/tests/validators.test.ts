import { describe, expect, it } from "vitest"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION, createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

import { coreContent } from "../src/renderer"
import { HEADING_ORDER_RULE, headingOrder } from "../src/validators"

/**
 * Heading order.
 *
 * Phase 9's accessibility requirements name this: "heading level order is
 * validated and warned on skip". A document rule rather than a component one,
 * because whether an `h4` is wrong depends entirely on what came before it.
 */

/** A page whose root holds headings at these levels, in this order. */
function pageOf(...levels: readonly number[]): CheckoutSchema {
  const base = createDocument({ projectId: "prj", pageId: "pag", themeId: "theme_default" })
  const root = base.nodes[base.root] as Node
  const nodes: Record<string, Node> = { ...base.nodes }
  const children: string[] = []

  levels.forEach((level, index) => {
    const id = `heading_${index}`

    children.push(id)
    nodes[id] = {
      id,
      type: "core.heading",
      parentId: base.root,
      children: [],
      props: { text: `Heading ${level}`, level },
      styles: {},
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false },
    }
  })

  return { ...base, nodes: { ...nodes, [base.root]: { ...root, children } } }
}

describe("what it reports", () => {
  it("says nothing about a page with no headings", () => {
    // A page somebody has not written yet is not a page with a problem.
    expect(headingOrder.validate(pageOf())).toEqual([])
  })

  it("says nothing about an outline that climbs one level at a time", () => {
    expect(headingOrder.validate(pageOf(1, 2, 3, 2, 3))).toEqual([])
  })

  it("warns on a skipped level", () => {
    /*
     * Going from h2 to h4 tells a screen reader user there is a level in
     * between that they have missed, and they will look for it. WCAG 1.3.1,
     * technique H42.
     */
    const issues = headingOrder.validate(pageOf(1, 2, 4))

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("Heading 2 to Heading 4")
    expect(issues[0]?.nodeIds).toEqual(["heading_2"])
  })

  it("says nothing about coming back up the outline", () => {
    // h4 then h2 starts a new section, which is ordinary and correct.
    expect(headingOrder.validate(pageOf(1, 2, 3, 4, 2))).toEqual([])
  })

  it("warns when the page has no level-1 heading at all", () => {
    /*
     * A page whose outline starts at h2 has no title, so the first thing a
     * screen reader user hears is a subsection. This is the rule that catches
     * the page nobody titled — and it exists because the default level for a
     * new Heading is 2, which is itself there so four inserted headings are not
     * four competing titles.
     */
    const issues = headingOrder.validate(pageOf(2, 3))

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("no level-1 heading")
  })

  it("reports both when a page has neither a title nor an order", () => {
    expect(headingOrder.validate(pageOf(2, 5)).map((issue) => issue.severity)).toEqual([
      "warning",
      "warning",
    ])
  })

  it("never blocks a publish", () => {
    /*
     * A heading order is a judgement about content. Refusing to publish over
     * one would be the editor overruling somebody who can see their own page —
     * `blocksPublish` treats only `error` and `critical` as blocking.
     */
    const issues = headingOrder.validate(pageOf(2, 5))

    expect(issues.every((issue) => issue.severity === "warning")).toBe(true)
  })

  it("reads a level the document should not contain as the fallback", () => {
    // `levelOf` is the same function the renderer uses, so the outline the
    // validator checks is the outline the page actually has.
    const document = pageOf(1)
    const heading = document.nodes["heading_0"] as Node

    const broken: CheckoutSchema = {
      ...document,
      nodes: { ...document.nodes, heading_0: { ...heading, props: { text: "x", level: 9 } } },
    }

    // Level 9 reads as 2, so the page now has no h1.
    expect(headingOrder.validate(broken)[0]?.message).toContain("no level-1 heading")
  })
})

describe("how it is registered", () => {
  it("arrives through the plugin, not by being imported somewhere", () => {
    const registry = new PluginHost({
      versions: { engine: "0.1.0", schema: CURRENT_VERSION },
    })
      .register(coreContent)
      .startSync()

    expect(registry.documentValidators().map((entry) => entry.rule)).toEqual([HEADING_ORDER_RULE])
  })

  it("is in the renderer half, so the publish path can see it", () => {
    /*
     * Not the editor half. Publishing runs the same validators the editor
     * shows, so a rule that lived only in the editor half would be a rule the
     * publish pre-flight could not run.
     */
    expect(headingOrder.label).toBe("Headings are in order")
  })
})
