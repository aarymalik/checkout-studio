import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { FIELD_STYLES } from "../../form/styles"
import { CheckboxRenderer } from "./Checkbox"
import { RadioGroupRenderer } from "./RadioGroup"
import { SelectRenderer } from "./Select"
import { optionsOf } from "./options"

/**
 * The fields whose answer is a choice.
 *
 * All three are `interactive: true` for the reason every field is: somebody
 * answers, and the answer has to be remembered, checked and shown back.
 *
 * `validate` is about what the merchant built, not about what a customer
 * answers. A Select with no options is a control that cannot be used, and it
 * is the kind of mistake that is invisible on a canvas — the field looks
 * finished, and the list is empty.
 */
function labelled(node: { props: Readonly<Record<string, unknown>> }): string | null {
  const label = node.props["label"]

  return typeof label === "string" && label.trim() !== ""
    ? null
    : "This field has no label, so it is labelled by its type instead."
}

export const select: ComponentDefinition = {
  type: "core.select",
  name: "Select",
  category: "Forms",
  interactive: true,
  container: false,
  defaultProps: { label: "Choose", required: false, options: [] },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: FIELD_STYLES,
  renderer: SelectRenderer,
  validate: (node) =>
    optionsOf(node.props["options"]).length === 0
      ? "This select has no options, so there is nothing to choose."
      : labelled(node),
}

export const checkbox: ComponentDefinition = {
  type: "core.checkbox",
  name: "Checkbox",
  category: "Forms",
  interactive: true,
  container: false,
  defaultProps: { label: "Tick to agree", required: false },
  defaultStyles: { display: "block" },
  descendantStyles: FIELD_STYLES,
  renderer: CheckboxRenderer,
  validate: labelled,
}

export const radioGroup: ComponentDefinition = {
  type: "core.radio-group",
  name: "Radio Group",
  category: "Forms",
  interactive: true,
  container: false,
  defaultProps: { label: "Choose one", required: false, options: [] },
  defaultStyles: { display: "block" },
  descendantStyles: FIELD_STYLES,
  renderer: RadioGroupRenderer,
  validate: (node) =>
    optionsOf(node.props["options"]).length === 0
      ? "This group has no options, so there is nothing to choose."
      : labelled(node),
}
