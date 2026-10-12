import { defineProperties } from "@checkout-studio/plugin-sdk"

import { FIELD_KINDS } from "../../form/fields"

/**
 * docs/component-library.md § Input: text, email, phone, number and password,
 * with a placeholder, validation, width, label, help text and a default value.
 *
 * The name is in Advanced rather than General. It is the key an answer is
 * submitted under, which matters to whoever reads the submissions and not to
 * the person laying out a page — and changing it quietly renames a column in
 * everything already collected.
 */
const KIND_LABELS: Record<string, string> = {
  text: "Text",
  email: "Email",
  tel: "Phone",
  number: "Number",
  password: "Password",
}

export const inputProperties = defineProperties([
  { key: "label", target: "prop", label: "Label", group: "General", control: "text" },
  {
    key: "kind",
    target: "prop",
    label: "Type",
    group: "General",
    control: "select",
    options: FIELD_KINDS.map((value) => ({ value, label: KIND_LABELS[value] ?? value })),
  },
  {
    key: "placeholder",
    target: "prop",
    label: "Placeholder",
    group: "General",
    control: "text",
    help: "An example answer. Not a substitute for the label, which stays visible.",
  },
  { key: "help", target: "prop", label: "Help text", group: "General", control: "text" },
  { key: "required", target: "prop", label: "Required", group: "General", control: "toggle" },
  {
    key: "minLength",
    target: "prop",
    label: "Minimum length",
    group: "Advanced",
    control: "number",
    showWhen: { key: "kind", not: "number" },
  },
  {
    key: "maxLength",
    target: "prop",
    label: "Maximum length",
    group: "Advanced",
    control: "number",
    showWhen: { key: "kind", not: "number" },
  },
  {
    key: "min",
    target: "prop",
    label: "Minimum",
    group: "Advanced",
    control: "number",
    showWhen: { key: "kind", equals: "number" },
  },
  {
    key: "max",
    target: "prop",
    label: "Maximum",
    group: "Advanced",
    control: "number",
    showWhen: { key: "kind", equals: "number" },
  },
  {
    key: "name",
    target: "prop",
    label: "Field name",
    group: "Advanced",
    control: "text",
    help: "The key this answer is saved under. Changing it renames the column in everything already collected.",
  },
  {
    key: "width",
    target: "style",
    label: "Width",
    group: "Layout",
    control: "dimension",
    units: ["%", "px", "rem", "auto"],
    responsive: true,
  },
])
