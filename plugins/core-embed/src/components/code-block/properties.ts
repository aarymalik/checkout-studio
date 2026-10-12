import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Code Block: CSS and HTML.
 *
 * Both `markup`-kind controls, because both hold a structure the control
 * produces from text: the markup becomes a tree and the CSS becomes a list of
 * rules. The inspector that renders them arrives in Phase 12.
 */
export const codeBlockProperties = defineProperties([
  {
    key: "content",
    target: "prop",
    label: "HTML",
    group: "General",
    control: "markup",
    help: "Scripts, styles, frames and form fields are removed. The editor lists what it took out.",
  },
  {
    key: "styles",
    target: "prop",
    label: "CSS",
    group: "General",
    control: "markup",
    help: "Applies to this block only. Breakpoints are set per style in the inspector, so @media is not used here.",
  },
])
