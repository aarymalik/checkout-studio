import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * What the inspector offers for a Section.
 *
 * Data, not UI. Phase 12 generates the panel from this; nothing here knows what
 * a control looks like, and this file imports no React. It is also validated at
 * module scope — `defineProperties` parses — so a property that could not be
 * drawn is a failure in this plugin at import time rather than half a panel in
 * front of a user.
 *
 * The list is docs/component-library.md § Section, in that order. Every entry
 * is a style and so every entry can be responsive, which is how "Supports:
 * Responsive" is delivered rather than claimed.
 */
export const sectionProperties = defineProperties([
  {
    key: "width",
    target: "style",
    label: "Width",
    group: "Layout",
    control: "dimension",
    units: ["%", "px", "rem", "vw"],
    responsive: true,
  },
  {
    key: "maxWidth",
    target: "style",
    label: "Max width",
    group: "Layout",
    control: "dimension",
    units: ["px", "rem", "%", "ch"],
    help: "Caps how wide the content gets on a large screen.",
    responsive: true,
  },
  {
    key: "backgroundColor",
    target: "style",
    label: "Background",
    group: "Background",
    control: "color",
    responsive: true,
    states: true,
  },
  {
    key: "backgroundImage",
    target: "prop",
    label: "Background image",
    group: "Background",
    control: "asset",
    /*
     * A prop rather than a style, and the one place in this file where that is
     * not a free choice: an asset reference is an object and a style value is
     * not. So it cannot be responsive either — the schema stores per-breakpoint
     * overrides for styles only.
     */
    help: "Covers the section, centred.",
  },
  {
    key: "padding",
    target: "style",
    label: "Padding",
    group: "Spacing",
    control: "spacing",
    units: ["px", "rem", "%"],
    responsive: true,
  },
  {
    key: "margin",
    target: "style",
    label: "Margin",
    group: "Spacing",
    control: "spacing",
    units: ["px", "rem", "%", "auto"],
    responsive: true,
  },
  {
    key: "border",
    target: "style",
    label: "Border",
    group: "Border",
    control: "border",
    responsive: true,
    states: true,
  },
  {
    key: "borderRadius",
    target: "style",
    label: "Radius",
    group: "Border",
    control: "radius",
    units: ["px", "rem", "%"],
    responsive: true,
  },
  {
    key: "boxShadow",
    target: "style",
    label: "Shadow",
    group: "Effects",
    control: "shadow",
    responsive: true,
    states: true,
  },
  {
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
  },
])
