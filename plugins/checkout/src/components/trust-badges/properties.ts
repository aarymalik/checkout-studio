import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Trust Badges: Icons, Text, Layout, Spacing.
 *
 * Icons and Text are one property, not two parallel lists: a badge is an icon
 * *and* its words, and two lists that have to stay the same length drift the
 * first time somebody deletes a row. The same decision core-forms made for a
 * select's options, and the same caveat — the inspector's editor for a list
 * arrives in Phase 12; until then this is the raw value.
 *
 * Layout and Spacing are styles rather than props, so three badges across on a
 * desktop can stack on a phone. The document stores per-breakpoint overrides
 * for styles only.
 */
export const trustBadgesProperties = defineProperties([
  {
    key: "badges",
    target: "prop",
    label: "Badges",
    group: "General",
    control: "text",
    help: "An icon and its words. The words are what a screen reader reads; the icon is decoration.",
  },
  {
    key: "flexDirection",
    target: "style",
    label: "Layout",
    group: "Layout",
    control: "select",
    options: [
      { value: "row", label: "Side by side" },
      { value: "column", label: "Stacked" },
    ],
    responsive: true,
  },
  {
    key: "gap",
    target: "style",
    label: "Spacing",
    group: "Spacing",
    control: "dimension",
    units: ["px", "rem", "%"],
    help: "Space between badges, without adding space around them.",
    responsive: true,
  },
])
