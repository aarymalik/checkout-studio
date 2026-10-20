/**
 * The inspector, as panels to photograph.
 *
 * ## Why this gallery exists
 *
 * Two alignment faults shipped in a row and neither was catchable by a test:
 * jsdom has no layout, so eleven hundred tests pass while a control sits in
 * the wrong place. Both were found by somebody looking at the screen and
 * sending a picture back.
 *
 * A screenshot is the only check there is for that, so the panel is
 * photographed the way the components next door are.
 *
 * ## One case per kind of control, not per component
 *
 * A panel full of text boxes says nothing a second panel of text boxes would
 * not. These are chosen for what they draw: a Section for its sides and for a
 * keyword where a unit goes, a Heading for a select and a text box, a Grid for
 * a column count, a Coupon for a panel that is only words, and a Spacer for a
 * property that is following the theme.
 *
 * ## A case is a component and a section
 *
 * The panel opens one section at a time — eleven open at once is a wall rather
 * than a panel, which docs/ui-guidelines.md says in those words. So a case
 * that did not say which section it was about photographed whichever one came
 * first, and the four-side spacing boxes, the thing this suite was built for,
 * were behind a closed header in every picture.
 */

export interface InspectorCase {
  /** Also the screenshot's name, so it must stay stable. */
  id: string
  /** The component whose registrations the panel is built from. */
  type: string
  /** The section to open, when the one that opens by itself is not the point. */
  section?: string
  /** What it is here to show, for somebody browsing rather than diffing. */
  shows: string
}

export const INSPECTOR_CASES: readonly InspectorCase[] = [
  {
    id: "section-layout",
    type: "core.section",
    shows: "A width, and a max width of none — a keyword sitting where a unit sits.",
  },
  {
    id: "section-spacing",
    type: "core.section",
    section: "Spacing",
    shows: "Padding and margin as four boxes each, with the unit level with the numbers.",
  },
  {
    id: "heading",
    type: "core.heading",
    shows: "A select whose options are numbers, and the text a heading starts with.",
  },
  { id: "grid", type: "core.grid", shows: "A column count, stored as the track list it means." },
  { id: "coupon", type: "checkout.coupon", shows: "A panel that is only words." },
  {
    id: "spacer",
    type: "core.spacer",
    shows: "One property following the theme: the token it holds, and what that is worth.",
  },
]
