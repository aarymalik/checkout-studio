"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement, RefObject } from "react"

import { FieldMessages } from "../../form/Field"
import { useField } from "../../form/useField"
import { choiceSpecOf } from "./spec"

/**
 * Checkbox.
 *
 * ## Not built on `Field`, and the reason is the label
 *
 * Every other field is a label above a control. A checkbox is a tick followed
 * by its words, and the words are the label — wrapping the input so that the
 * whole line is clickable, which on a phone is the difference between a
 * consent box people can tick and one they keep missing.
 *
 * `Field` renders the label before the control by design, because that is
 * right for all the others. Bending it into both shapes would put a special
 * case into the one piece of wiring that has to be identical everywhere.
 *
 * So the layout is this component's and everything else is shared: `useField`
 * for the connection to the form — the first version did its own and quietly
 * did not register, which is a field that looks right, holds what somebody
 * ticked, and submits nothing — and `FieldMessages` for the help and the
 * error, so they carry the ids `aria-describedby` expects.
 *
 * ## The value is a string
 *
 * "true" or empty, like every other field, because the form holds one record
 * of strings and a single boolean would be the only value that is not one. The
 * rules know what it means; see `validate.ts`.
 */
export function CheckboxRenderer({
  className,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  const spec = choiceSpecOf(props, node.id, "checkbox", "Tick to agree")
  const { id, value, error, describedBy, ref, setValue, validate } = useField(spec)

  return (
    <div className={className}>
      <label className="ck-field-choice" htmlFor={id}>
        <input
          id={id}
          ref={ref as RefObject<HTMLInputElement | null>}
          className="ck-field-tick"
          type="checkbox"
          name={spec.name}
          checked={value === "true"}
          required={spec.required}
          aria-required={spec.required}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
          readOnly={mode === "editor-preview"}
          onChange={(event) => setValue(event.target.checked ? "true" : "")}
          onBlur={validate}
        />
        <span>
          {spec.label}
          {spec.required ? <span aria-hidden="true"> *</span> : null}
        </span>
      </label>
      <FieldMessages id={id} help={spec.help} error={error} />
    </div>
  )
}
