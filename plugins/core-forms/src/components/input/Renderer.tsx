"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement, RefObject } from "react"

import { Field } from "../../form/Field"
import { specOf } from "./spec"

/**
 * Input and Textarea.
 *
 * One file, because they are one field with two shapes of control: the rows
 * are the only thing a textarea has that an input does not, and splitting them
 * would be two copies of the same attributes drifting apart.
 *
 * Everything that is not the control — the label, the help text, the error, the
 * ids and the registration — is `Field`, because it has to be identical across
 * every field in the product.
 */
export function InputRenderer({
  className,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  const spec = specOf(props, node.id)

  return (
    <Field
      spec={spec}
      className={className}
      control={({ id, value, describedBy, invalid, ref, onChange, onBlur }) => {
        const shared = {
          id,
          name: spec.name,
          value,
          placeholder: spec.placeholder,
          required: spec.required,
          "aria-required": spec.required,
          "aria-invalid": invalid ? true : undefined,
          "aria-describedby": describedBy,
          /*
           * Read-only in the editor rather than disabled: a disabled control is
           * skipped by the keyboard and dimmed, so the canvas would show the
           * component in a state no published page puts it in.
           */
          readOnly: mode === "editor-preview",
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          onBlur,
        }

        if (spec.kind === "textarea") {
          return (
            <textarea
              {...shared}
              ref={ref as RefObject<HTMLTextAreaElement | null>}
              rows={spec.rows ?? 4}
            />
          )
        }

        return (
          <input
            {...shared}
            ref={ref as RefObject<HTMLInputElement | null>}
            type={spec.kind === "number" ? "number" : spec.kind}
          />
        )
      }}
    />
  )
}
