import { collect } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"

import { levelOf } from "./components/heading/Renderer"

/**
 * Heading order.
 *
 * A document rule rather than a component one, because no heading can answer it
 * alone: whether an `h4` is wrong depends entirely on what came before it.
 * Phase 9's accessibility requirements name this — "heading level order is
 * validated and warned on skip".
 *
 * Two things are reported, and both are real rules rather than style
 * preferences:
 *
 * - **A skipped level.** Going from `h2` to `h4` tells a screen reader user
 *   there is a level in between that they have missed, and they will look for
 *   it. WCAG 1.3.1, technique H42.
 * - **No level 1 at all.** A page whose outline starts at `h2` has no title,
 *   so the first thing a screen reader user hears is a subsection. The default
 *   level for a new Heading is 2 precisely so that four inserted headings are
 *   not four competing titles, which makes this the rule that catches the page
 *   nobody titled.
 *
 * Both are warnings. Neither blocks a publish: a heading order is a judgement
 * about content, and refusing to publish a page over one would be the editor
 * overruling somebody who can see their own page. `blocksPublish` treats
 * `error` and `critical` as blocking and this as neither.
 */
export const HEADING_ORDER_RULE = "core-content.heading-order"

function headingLevels(document: CheckoutSchema): readonly { id: string; level: number }[] {
  const found: { id: string; level: number }[] = []

  /*
   * In document order, which is what `collect` gives: a depth-first walk from
   * the root through each node's children in the order they are stored. That is
   * the order the page is read in, and heading order is a claim about reading
   * order rather than about the tree's shape.
   */
  for (const node of collect(document)) {
    if (node.type === "core.heading") {
      found.push({ id: node.id, level: levelOf(node.props["level"]) })
    }
  }

  return found
}

export const headingOrder: DocumentValidatorRegistration = {
  rule: HEADING_ORDER_RULE,
  label: "Headings are in order",
  validate: (document) => {
    const headings = headingLevels(document)

    if (headings.length === 0) return []

    const issues: ValidationIssue[] = []

    if (!headings.some((heading) => heading.level === 1)) {
      issues.push({
        rule: HEADING_ORDER_RULE,
        severity: "warning",
        message:
          "This page has no level-1 heading, so its outline starts partway down. Promote its title to Heading 1.",
        nodeIds: [headings[0]?.id ?? ""],
      })
    }

    let previous = headings[0]?.level ?? 1

    for (const heading of headings.slice(1)) {
      /*
       * Only a jump *down* the outline is a skip. Coming back up — `h4` then
       * `h2` — starts a new section, which is ordinary and correct.
       */
      if (heading.level > previous + 1) {
        issues.push({
          rule: HEADING_ORDER_RULE,
          severity: "warning",
          message: `This jumps from Heading ${previous} to Heading ${heading.level}, so a level is missing from the outline.`,
          nodeIds: [heading.id],
        })
      }

      previous = heading.level
    }

    return issues
  },
}
