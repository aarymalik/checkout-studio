import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § FAQ: Questions, Answers, Icons, Animation.
 *
 * Questions and Answers are one list, because a question without its answer is
 * a disclosure that opens onto nothing. Two lists that must stay the same
 * length drift the first time somebody deletes a row.
 *
 * Icons is absent: there is one icon, a chevron, and it says which state the
 * disclosure is in. A choice of glyph there would be decoration on the only
 * part of the component that carries information.
 *
 * Animation is absent too. A `<details>` cannot be animated open without
 * scripting its height, which would make a static component interactive in
 * order to decorate a transition.
 */
export const faqProperties = defineProperties([
  {
    key: "items",
    target: "prop",
    label: "Questions",
    group: "General",
    control: "text",
    help: "A question and its answer. One without the other is left out.",
  },
])
