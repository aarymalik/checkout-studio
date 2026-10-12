"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import { useEffect, useId, useRef } from "react"
import type { ReactElement } from "react"

import { useForm } from "../../form/FormProvider"
import { specOf } from "./spec"
import { FIELD_ERROR_CLASS } from "./styles"

/**
 * Input.
 *
 * ## Labelled, always
 *
 * The label is an element, not a placeholder. A placeholder disappears the
 * moment somebody types, so a form built from them is one a person cannot
 * check before submitting and a screen reader announces as a row of blanks.
 * docs/component-library.md lists both, and they are different things: the
 * label says what the field is, the placeholder shows the shape of an answer.
 *
 * ## What `aria-describedby` points at
 *
 * The help text, and the error when there is one — in that order, because a
 * screen reader reads them in the order given and the error is the thing the
 * person needs to act on. `aria-invalid` marks the field itself, so the error
 * is announced by the field rather than only sitting beside it.
 *
 * ## Checked when it is left, not while it is typed
 *
 * Validation on every keystroke tells somebody their email is wrong when they
 * are three characters into typing it. The field is checked on blur, and an
 * error is cleared as soon as they start fixing it.
 */
export function InputRenderer({
  className,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  const spec = specOf(props, node.id)
  const form = useForm()
  const field = useRef<HTMLInputElement>(null)
  const id = useId()
  const describedBy = [spec.help === undefined ? null : `${id}-help`]

  const error = form?.errors[spec.name]
  const register = form?.register

  useEffect(() => {
    if (register === undefined) return

    return register({ ...spec, focus: () => field.current?.focus() })
    /*
     * The fields of the descriptor, not the descriptor.
     *
     * `specOf` builds a new object every render, so depending on the object
     * is an effect that runs every time — and its cleanup sets state, which
     * renders, which runs it again. I put `spec` in this list and the test
     * suite stopped responding; that is what it looks like from outside.
     *
     * The fields are primitives, so the effect runs when the merchant changes
     * one and not when a customer types.
     */
  }, [
    register,
    spec.name,
    spec.kind,
    spec.label,
    spec.required,
    spec.min,
    spec.max,
    spec.minLength,
    spec.maxLength,
  ])

  if (error !== undefined) describedBy.push(`${id}-error`)

  return (
    <div className={className}>
      <label htmlFor={id}>
        {spec.label}
        {/* The required mark is decoration; `aria-required` on the field is
            what a screen reader announces, so this is hidden from it rather
            than read out as "asterisk". */}
        {spec.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        ref={field}
        name={spec.name}
        type={spec.kind === "number" ? "number" : spec.kind}
        value={form?.values[spec.name] ?? ""}
        placeholder={spec.placeholder}
        required={spec.required}
        aria-required={spec.required}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy.filter((value) => value !== null).join(" ") || undefined}
        /*
         * Read-only in the editor rather than disabled: a disabled field is
         * skipped by the keyboard and dimmed, so the canvas would show the
         * component in a state no published page puts it in.
         */
        readOnly={mode === "editor-preview"}
        onChange={(event) => form?.setValue(spec.name, event.target.value)}
        onBlur={() => form?.validateField(spec.name)}
      />
      {spec.help === undefined ? null : <p id={`${id}-help`}>{spec.help}</p>}
      {error === undefined ? null : (
        <p id={`${id}-error`} className={FIELD_ERROR_CLASS} data-ck-field-error>
          {error}
        </p>
      )}
    </div>
  )
}
