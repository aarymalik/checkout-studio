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

import type { Breakpoint } from "@checkout-studio/schema"

export interface InspectorCase {
  /** Also the screenshot's name, so it must stay stable. */
  id: string
  /** The component whose registrations the panel is built from. */
  type: string
  /** The section to open, when the one that opens by itself is not the point. */
  section?: string
  // The breakpoint the panel is editing. Desktop, the base, when absent.
  at?: Breakpoint
  // Typed into the search field before the picture, for a case about results
  // rather than about the panel at rest.
  search?: string
  // What the application wants said beneath a control, keyed as the
  // definitions are. The markup properties are the ones that have any: the
  // parser names what it took out, and the panel shows it.
  notes?: Record<string, readonly string[]>
  // Keys the selection does not agree on, for a case about editing several
  // components at once. The panel takes this set from the application, so a
  // case giving one is using the product's own door rather than reaching past
  // it the way a seeded search query would.
  mixed?: readonly string[]
  /**
   * What the node holds of its own, for a case about an overridden property.
   *
   * Everything else here is a freshly inserted node, where every value comes
   * from the component's defaults. That is the right subject for most of the
   * panel and the wrong one for anything that appears only once somebody has
   * changed something — a gallery of fresh nodes would photograph the reset,
   * and the override indicator beside it, never.
   */
  own?: {
    props?: Record<string, unknown>
    // Keyed by breakpoint, because an override is only interesting next to the
    // value it overrides.
    styles?: Partial<Record<Breakpoint, Record<string, unknown>>>
  }
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
    id: "section-overridden",
    type: "core.section",
    section: "Spacing",
    // A literal, and it has to be one. This case exists to photograph a value
    // somebody typed rather than one that came from the theme — a token here
    // would be the opposite of the subject, and the panel would draw it muted
    // with no reset beside it.
    // design-system-ignore: the point of the case is a value off the scale.
    own: { styles: { desktop: { paddingTop: "12px" } } },
    shows: "One side typed by hand — its own value in black, and the reset that gives it back.",
  },
  {
    id: "section-tablet",
    type: "core.section",
    section: "Spacing",
    at: "tablet",
    // Both breakpoints, because an override is only legible beside the value
    // it is overriding: 4 is what tablet uses, and 12 is what it would go back
    // to if the override were removed.
    // design-system-ignore: the point of the case is values off the scale.
    own: { styles: { desktop: { paddingTop: "12px" }, tablet: { paddingTop: "4px" } } },
    shows: "A tablet override, marked as set for tablet, and the Remove that gives the base back.",
  },
  {
    id: "section-search",
    type: "core.section",
    // Three groups and two kinds of match: "Padding" and "Shadow" contain the
    // letters, "Background" only has them in order.
    search: "ad",
    shows: "Results from every section at once, each run under the group it came from.",
  },
  {
    id: "section-mixed",
    type: "core.section",
    section: "Spacing",
    mixed: ["padding"],
    shows: "Two components that disagree: four boxes saying Mixed, and a margin that does not.",
  },
  {
    id: "section-shadow",
    type: "core.section",
    section: "Effects",
    // The theme's own `shadows.md`, written as a literal so the control has a
    // shadow to take apart — a token would be shown as a token instead.
    // design-system-ignore: the case is about the parts of this exact value.
    own: { styles: { desktop: { boxShadow: "0 4px 12px rgba(10, 10, 10, 0.08)" } } },
    shows: "A shadow in parts: across, down, blur and colour — and no spread, because it has none.",
  },
  {
    id: "section-border",
    type: "core.section",
    section: "Border",
    // A width, a style and a colour, which is what a border is. The theme's
    // own border colour, written as a literal so the control has one to show.
    // design-system-ignore: the case is about the parts of this exact value.
    own: { styles: { desktop: { border: "1px solid #e5e5e5" } } },
    shows: "A border as a width beside its style, with the colour under them.",
  },
  {
    id: "html-block",
    type: "core.html-block",
    shows: "A code box, with the note the parser leaves when it takes something out.",
    notes: { content: ["Removed: script, onclick."] },
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
