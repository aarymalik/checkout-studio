import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { InputRenderer } from "./Renderer"
import { FIELD_STYLES } from "../../form/styles"

/**
 * Input's registration.
 *
 * `interactive: true`, and the first component in the product that is.
 * Everything before this renders on the server and hydrates nothing; a field
 * cannot, because somebody types into it and what they typed has to be
 * remembered, checked and shown back.
 *
 * The flag is not machinery — `RenderNode` is a server component with no
 * hooks, so a `"use client"` renderer ships itself and nothing else changes.
 * What the flag does is make the fact visible: a component declaring it is a
 * component spending the published bundle's budget.
 */
export const input: ComponentDefinition = {
  type: "core.input",
  name: "Input",
  category: "Forms",
  interactive: true,
  container: false,
  defaultProps: { kind: "text", label: "Label", required: false },
  defaultStyles: { display: "block", width: "100%" },
  /*
   * A field's label, control and messages are not nodes, so the cascade does
   * not reach them. Without these the gallery's first screenshot was three
   * labels and no boxes at all — see form/styles.ts.
   */
  descendantStyles: FIELD_STYLES,
  renderer: InputRenderer,
  /*
   * Reads the prop, not the spec.
   *
   * `specOf` falls back to the kind's name so a field is never unlabelled to a
   * screen reader — which meant a validator asking the spec was asking about
   * its own fallback and could not fail. What is worth reporting is that the
   * merchant has not named this field, and that is a question about the prop.
   */
  validate: (node) => {
    const label = node.props["label"]

    return typeof label === "string" && label.trim() !== ""
      ? null
      : "This field has no label, so it is labelled by its type instead."
  },
}

/**
 * Textarea.
 *
 * The same component as Input, which is why it is registered from here: the
 * only thing a textarea has that an input does not is its rows, and two files
 * would be two copies of the same attributes drifting apart.
 *
 * It is a type of its own rather than a kind of Input because the catalog
 * lists it as one, and because a merchant looking for "Textarea" in the
 * library should find it rather than discover it is a setting on something
 * else.
 */
export const textarea: ComponentDefinition = {
  ...input,
  type: "core.textarea",
  name: "Textarea",
  defaultProps: { kind: "textarea", label: "Label", required: false, rows: 4 },
}
