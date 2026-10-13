"use client"

import { useEffect, useId, useRef } from "react"
import type { RefObject } from "react"

import { useForm } from "./FormProvider"
import type { FieldSpec } from "./fields"

/**
 * A field's connection to the form it is in.
 *
 * ## Why this is a hook and not just `Field`
 *
 * Almost every field is a label above a control, which `Field` renders. A
 * checkbox is not: it is a tick followed by its words, and the words *are* the
 * label, wrapping the input so the whole line is clickable.
 *
 * The first version of the checkbox did its own layout and, in doing so, its
 * own everything — and quietly did not register. A field that does not
 * register is a field whose value is not in the submission: it would have
 * looked right, held what somebody typed, and submitted nothing. So the part
 * that must be identical is here, and only the layout differs.
 *
 * ## What registering decides
 *
 * The schema is composed from the fields that registered, so this is what puts
 * a field in the payload and in the validation. A field that unmounts —
 * hidden by a condition — takes its value with it.
 */

export interface FieldConnection {
  /** Unique per instance, for tying a label and its messages to the control. */
  id: string
  value: string
  error: string | undefined
  /** `aria-describedby`, or undefined when there is nothing to point at. */
  describedBy: string | undefined
  /** Attach to the control, so a failed submit can focus it. */
  ref: RefObject<HTMLElement | null>
  setValue: (value: string) => void
  validate: () => void
}

export function useField(spec: FieldSpec): FieldConnection {
  const form = useForm()
  const id = useId()
  const element = useRef<HTMLElement>(null)

  const error = form?.errors[spec.name]
  const register = form?.register

  /*
   * What the field is, as a string.
   *
   * The effect below must run when the merchant changes the field and never
   * when a customer types — and a spec is rebuilt from props on every render,
   * so depending on it is an effect that runs every time. Its cleanup sets
   * state, which renders, which runs it again.
   *
   * I listed the primitive fields instead, which worked until a field had
   * options: `optionsOf` returns a new array each render, and the suite
   * stopped responding for the second time. A list of fields is a list that is
   * wrong the next time one is added, so the dependency is the value rather
   * than the shape of the value.
   */
  const identity = JSON.stringify(spec)
  const latest = useRef(spec)

  latest.current = spec

  useEffect(() => {
    if (register === undefined) return

    return register({ ...latest.current, focus: () => element.current?.focus() })
  }, [register, identity])

  const described = [
    spec.help === undefined ? null : `${id}-help`,
    error === undefined ? null : `${id}-error`,
  ].filter((value) => value !== null)

  return {
    id,
    value: form?.values[spec.name] ?? "",
    error,
    describedBy: described.length === 0 ? undefined : described.join(" "),
    ref: element,
    setValue: (value) => form?.setValue(spec.name, value),
    validate: () => form?.validateField(spec.name),
  }
}
