import type { PropertyDefinitionInput } from "@checkout-studio/plugin-sdk"

/**
 * The property definitions more than one layout component has.
 *
 * Written once. Six components list Padding and the catalog means the same
 * control each time, so six copies would be six chances for one of them to
 * drift into saying `units: ["px"]` and nobody noticing until a user cannot
 * type a percentage.
 *
 * Each component still composes its own list from these — the catalog says
 * which properties a component has, and that is a per-component fact. Nothing
 * here is a base class.
 */

export const width: PropertyDefinitionInput = {
  key: "width",
  target: "style",
  label: "Width",
  group: "Layout",
  control: "dimension",
  units: ["%", "px", "rem", "vw"],
  responsive: true,
}

export const maxWidth: PropertyDefinitionInput = {
  key: "maxWidth",
  target: "style",
  label: "Max width",
  group: "Layout",
  control: "dimension",
  units: ["px", "rem", "%", "ch"],
  help: "Caps how wide the content gets on a large screen.",
  responsive: true,
}

export const gap: PropertyDefinitionInput = {
  key: "gap",
  target: "style",
  label: "Gap",
  group: "Spacing",
  control: "dimension",
  units: ["px", "rem", "%"],
  help: "Space between children, without adding space around them.",
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

export const backgroundColor: PropertyDefinitionInput = {
  key: "backgroundColor",
  target: "style",
  label: "Background",
  group: "Background",
  control: "color",
  responsive: true,
  states: true,
}

export const backgroundImage: PropertyDefinitionInput = {
  key: "backgroundImage",
  target: "prop",
  label: "Background image",
  group: "Background",
  control: "asset",
  /*
   * A prop, and the one place in these files where that is not a free choice:
   * an asset reference is an object and a style value is not. So it cannot be
   * responsive either — the document stores per-breakpoint overrides for
   * styles only.
   */
  help: "Covers the element, centred.",
}

export const border: PropertyDefinitionInput = {
  key: "border",
  target: "style",
  label: "Border",
  group: "Border",
  control: "border",
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

export const boxShadow: PropertyDefinitionInput = {
  key: "boxShadow",
  target: "style",
  label: "Shadow",
  group: "Effects",
  control: "shadow",
  responsive: true,
  states: true,
}

export const overflow: PropertyDefinitionInput = {
  key: "overflow",
  target: "style",
  label: "Overflow",
  group: "Advanced",
  control: "select",
  options: [
    { value: "visible", label: "Visible" },
    { value: "hidden", label: "Hidden" },
    { value: "auto", label: "Scroll when needed" },
    { value: "clip", label: "Clip" },
  ],
  advanced: true,
  responsive: true,
}

/**
 * How children line up across the axis, and along it.
 *
 * Labelled in the words the catalog uses — Alignment and Justify — rather than
 * in CSS's. `align-items` and `justify-content` are the right keys and the
 * wrong names: somebody arranging a page is deciding where things sit, not
 * which flexbox property governs it.
 */
export const alignItems: PropertyDefinitionInput = {
  key: "alignItems",
  target: "style",
  label: "Alignment",
  group: "Layout",
  control: "select",
  options: [
    { value: "stretch", label: "Stretch" },
    { value: "flex-start", label: "Start" },
    { value: "center", label: "Centre" },
    { value: "flex-end", label: "End" },
    { value: "baseline", label: "Baseline" },
  ],
  responsive: true,
}

export const justifyContent: PropertyDefinitionInput = {
  key: "justifyContent",
  target: "style",
  label: "Justify",
  group: "Layout",
  control: "select",
  options: [
    { value: "flex-start", label: "Start" },
    { value: "center", label: "Centre" },
    { value: "flex-end", label: "End" },
    { value: "space-between", label: "Space between" },
    { value: "space-around", label: "Space around" },
    { value: "space-evenly", label: "Space evenly" },
  ],
  responsive: true,
}
