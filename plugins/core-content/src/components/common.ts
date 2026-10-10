import type { PropertyDefinitionInput } from "@checkout-studio/plugin-sdk"

import { HEADING_LEVELS } from "./heading/Renderer"

/**
 * The property definitions more than one content component has.
 *
 * Written once, for the reason `core-layout`'s equivalent is: the catalog gives
 * Text "everything from Heading", and two copies of a font-size control is two
 * chances for one to start offering a different set of units.
 *
 * Each component still composes its own list. The catalog says which properties
 * a component has, and that is a per-component fact.
 */

export const text: PropertyDefinitionInput = {
  key: "text",
  target: "prop",
  label: "Text",
  group: "General",
  control: "text",
}

export const level: PropertyDefinitionInput = {
  key: "level",
  target: "prop",
  label: "Level",
  group: "General",
  control: "select",
  options: HEADING_LEVELS.map((value) => ({ value, label: `Heading ${value}` })),
  help: "Where this sits in the page's outline. A screen reader navigates by it.",
}

export const width: PropertyDefinitionInput = {
  key: "width",
  target: "style",
  label: "Width",
  group: "Layout",
  control: "dimension",
  units: ["%", "px", "rem", "auto"],
  responsive: true,
}

export const fontFamily: PropertyDefinitionInput = {
  key: "fontFamily",
  target: "style",
  label: "Font",
  group: "Typography",
  control: "select",
  /*
   * Token references rather than font names.
   *
   * The theme owns which typeface is the heading one, so a page that named
   * "Inter" here would keep naming it after a rebrand. Three options because a
   * theme has three families; a fourth belongs in the theme first.
   */
  options: [
    { value: "{typography.fontFamily.heading}", label: "Heading" },
    { value: "{typography.fontFamily.body}", label: "Body" },
    { value: "{typography.fontFamily.mono}", label: "Monospace" },
  ],
  responsive: true,
}

export const fontSize: PropertyDefinitionInput = {
  key: "fontSize",
  target: "style",
  label: "Size",
  group: "Typography",
  control: "dimension",
  units: ["rem", "px", "em", "%"],
  responsive: true,
}

export const fontWeight: PropertyDefinitionInput = {
  key: "fontWeight",
  target: "style",
  label: "Weight",
  group: "Typography",
  control: "select",
  options: [
    { value: 400, label: "Regular" },
    { value: 500, label: "Medium" },
    { value: 600, label: "Semibold" },
    { value: 700, label: "Bold" },
  ],
  responsive: true,
}

export const lineHeight: PropertyDefinitionInput = {
  key: "lineHeight",
  target: "style",
  label: "Line height",
  group: "Typography",
  /*
   * A number, not a dimension, and the control kind exists for this.
   * `line-height: 1.6` scales with the font size; `line-height: 1.6px` is a
   * line of text on top of the next one, and a unit picker beside this field
   * would invite exactly that.
   */
  control: "number",
  min: 0.8,
  max: 3,
  responsive: true,
}

export const letterSpacing: PropertyDefinitionInput = {
  key: "letterSpacing",
  target: "style",
  label: "Letter spacing",
  group: "Typography",
  control: "dimension",
  // `em` first, so a bare number means em and tracking follows the size.
  units: ["em", "px", "rem"],
  responsive: true,
}

export const textAlign: PropertyDefinitionInput = {
  key: "textAlign",
  target: "style",
  label: "Alignment",
  group: "Typography",
  control: "select",
  /*
   * `start` and `end` rather than `left` and `right`.
   *
   * They follow the writing direction, so a checkout rendered in Arabic aligns
   * to the right without anything being re-set. The labels say Left and Right
   * because that is what somebody looking at an English page sees.
   */
  options: [
    { value: "start", label: "Left" },
    { value: "center", label: "Centre" },
    { value: "end", label: "Right" },
    { value: "justify", label: "Justified" },
  ],
  responsive: true,
}

export const color: PropertyDefinitionInput = {
  key: "color",
  target: "style",
  label: "Colour",
  group: "Typography",
  control: "color",
  responsive: true,
  states: true,
}

export const gradient: PropertyDefinitionInput = {
  key: "gradient",
  target: "prop",
  label: "Gradient",
  group: "Effects",
  control: "gradient",
  /*
   * A prop, because it is three declarations rather than one property — see
   * `gradient.ts`. Which also means it cannot be responsive: the document
   * stores per-breakpoint overrides for styles only.
   */
  help: "Paints the text with a gradient instead of a flat colour.",
}

export const textShadow: PropertyDefinitionInput = {
  key: "textShadow",
  target: "style",
  label: "Shadow",
  group: "Effects",
  control: "shadow",
  responsive: true,
}

export const backgroundColor: PropertyDefinitionInput = {
  key: "backgroundColor",
  target: "style",
  label: "Background",
  group: "Background",
  control: "color",
  responsive: true,
  states: true,
}

export const borderRadius: PropertyDefinitionInput = {
  key: "borderRadius",
  target: "style",
  label: "Radius",
  group: "Border",
  control: "radius",
  units: ["px", "rem", "%"],
  responsive: true,
}

export const padding: PropertyDefinitionInput = {
  key: "padding",
  target: "style",
  label: "Padding",
  group: "Spacing",
  control: "spacing",
  units: ["px", "rem", "%"],
  responsive: true,
}

export const margin: PropertyDefinitionInput = {
  key: "margin",
  target: "style",
  label: "Margin",
  group: "Spacing",
  control: "spacing",
  units: ["px", "rem", "%", "auto"],
  responsive: true,
}
