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

/**
 * Country Selector.
 *
 * ## The same control as Select, and a different editor
 *
 * What it renders is a select, because that is what choosing a country is. The
 * difference is where the list comes from: the inspector offers every country
 * and the merchant picks the ones they ship to, which are then stored in the
 * document like any other options.
 *
 * So the published page carries exactly the countries that page offers — a
 * checkout shipping to three does not make a customer download two hundred and
 * fifty — and the list itself never leaves the editor's bundle. See
 * `countries.ts`.
 *
 * ## Empty by default, on purpose
 *
 * A Country field with no countries is refused by `validate`, the same as a
 * Select with no options. Defaulting to a guess would be this component
 * deciding where somebody's business ships to, and the merchant is the only
 * one who knows.
 */
export const country: ComponentDefinition = {
  ...select,
  type: "core.country",
  name: "Country Selector",
  defaultProps: { label: "Country", required: true, options: [] },
  validate: (node) =>
    optionsOf(node.props["options"]).length === 0
      ? "This field offers no countries. Choose the ones you ship to."
      : labelled(node),
}
