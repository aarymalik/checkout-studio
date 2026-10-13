"use client"

import type { ReactElement, ReactNode, RefObject } from "react"

import { useField } from "./useField"
import type { FieldSpec } from "./fields"

/**
 * Everything a field has that is not its control.
 *
 * The label, the help text, the error, the ids that tie them together, and the
 * registration that puts the field in the form. Written once because it has to
 * be identical across every field: an accessible name wired one way on a text
 * input and another way on a radio group is two chances to get it wrong, and
 * the one that is wrong is the one nobody tested with a screen reader.
 *
 * The connection to the form — the value, the error, the ids and the
 * registration — is `useField`, which the checkbox uses too: it lays its label
 * out differently and must still be in the payload the same way.
 *
 * ## What the control is handed
 *
 * A render prop rather than `children`, because the control needs the ids this
 * component generates and the value and callbacks the form holds. The
 * alternative — each field reaching into the context itself — is how the
 * wiring drifts.
 *
 * ## Grouped fields label themselves differently
 *
 * A radio group has no single control to point a `<label>` at: the accessible
 * name belongs to a `<fieldset>` and is carried by its `<legend>`. So this
 * renders either a label and a control, or a fieldset and a legend, and the
 * control says which it needs. Getting that wrong is the most common
 * accessibility failure in a form, and it is one decision here rather than one
 * per component.
 */

export interface FieldControlProps {
  id: string
  value: string
  describedBy: string | undefined
  invalid: boolean
  /** Attached by controls that can be focused when a submit fails. */
  ref: RefObject<HTMLElement | null>
  onChange: (value: string) => void
  onBlur: () => void
}

export interface FieldProps {
  spec: FieldSpec
  className: string
  /**
   * Whether the label is a `<legend>` inside a `<fieldset>`.
   *
   * True for a group of controls that share one name — a radio group. False
   * for anything with a single control to point a `<label>` at.
   */
  grouped?: boolean
  /** Rendered after the label, before the help text. */
  control: (props: FieldControlProps) => ReactNode
}

export function Field({
  spec,
  className,
  grouped = false,
  control,
}: FieldProps): ReactElement | null {
  const { visible, id, value, error, describedBy, ref, setValue, validate } = useField(spec)

  /*
   * Gone, not hidden. A field whose condition is not met unmounts, and
   * `useField`'s cleanup takes its value and its error with it — which is what
   * keeps it out of the submission without a second mechanism to remember.
   */
  if (!visible) return null

  const rendered = control({
    id,
    value,
    describedBy,
    invalid: error !== undefined,
    ref,
    onChange: setValue,
    onBlur: validate,
  })

  /*
   * The required mark is decoration. `aria-required` on the control is what a
   * screen reader announces, so this is hidden from it — otherwise the name of
   * every required field ends in "asterisk".
   */
  const name = (
    <>
      {spec.label}
      {spec.required ? <span aria-hidden="true"> *</span> : null}
    </>
  )

  const messages = <FieldMessages id={id} help={spec.help} error={error} />

  if (grouped) {
    return (
      <fieldset className={className}>
        <legend>{name}</legend>
        {rendered}
        {messages}
      </fieldset>
    )
  }

  return (
    <div className={className}>
      <label htmlFor={id}>{name}</label>
      {rendered}
      {messages}
    </div>
  )
}

/**
 * The help text and the error, with the ids `aria-describedby` points at.
 *
 * Its own component because the checkbox lays its label out differently and
 * still has to say these the same way.
 */
export function FieldMessages({
  id,
  help,
  error,
}: {
  id: string
  help: string | undefined
  error: string | undefined
}): ReactElement {
  return (
    <>
      {help === undefined ? null : <p id={`${id}-help`}>{help}</p>}
      {error === undefined ? null : (
        <p id={`${id}-error`} className={FIELD_ERROR_CLASS} data-ck-field-error>
          {error}
        </p>
      )}
    </>
  )
}

/** The class the error message carries, so the theme can colour it. */
export const FIELD_ERROR_CLASS = "ck-field-error"
