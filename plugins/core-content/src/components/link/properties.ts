import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Link: Text, URL, Target, Underline, Colour,
 * Hover.
 *
 * Five of the six are controls. Hover is the state layer every style already
 * has — the colour below is marked `states: true`, which is what gives a link
 * its hover colour without a control of its own.
 */
export const linkProperties = defineProperties([
  common.text,
  { key: "href", target: "prop", label: "URL", group: "General", control: "url" },
  {
    key: "target",
    target: "prop",
    label: "Opens in",
    group: "General",
    control: "select",
    options: [
      { value: "_self", label: "This tab" },
      { value: "_blank", label: "A new tab" },
    ],
  },
  {
    key: "textDecoration",
    target: "style",
    label: "Underline",
    group: "Typography",
    control: "select",
    options: [
      { value: "underline", label: "Always" },
      { value: "none", label: "Never" },
    ],
    help: "Colour alone does not tell a link from text for everybody who reads this page.",
    responsive: true,
    states: true,
  },
  common.color,
])
