"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement, RefObject } from "react"

import { Field } from "../../form/Field"
import { choiceSpecOf } from "./spec"

/**
 * Select.
 *
 * ## Deviation: a native select, not a searchable combobox
 *
 * docs/component-library.md lists "Searchable". A native `<select>` already
 * is: typing jumps to the matching option, in every browser, without any
 * JavaScript from us. On a phone it opens the platform's own picker, which is
 * better than anything we would build and is what people already know.
 *
 * A custom combobox is a listbox, a filter, a focus manager and a set of
 * `aria-activedescendant` rules — the single most commonly broken widget on
 * the web — and several kilobytes on a page with a 60 KB budget that has to
 * fit Stripe's payment element. If a merchant turns out to need one over a
 * hundred options, a Country field is the shape that argument should take.
 *
 * ## The placeholder is a disabled first option
 *
 * Not a `placeholder` attribute, which `<select>` does not have. It carries
 * the empty value, so choosing it is choosing nothing, and it is disabled once
 * a real answer exists so that it cannot be chosen *back* to by accident.
 */
export function SelectRenderer({
  className,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  const spec = choiceSpecOf(props, node.id, "select", "Choose")

  return (
    <Field
      spec={spec}
      className={className}
      control={({ id, value, describedBy, invalid, ref, onChange, onBlur }) => (
        <select
          id={id}
          ref={ref as RefObject<HTMLSelectElement | null>}
          name={spec.name}
          value={value}
          required={spec.required}
          aria-required={spec.required}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          /*
           * A select cannot be read-only — the attribute does nothing on one —
           * so the canvas gets a disabled control. It is the one place a
           * disabled field is right: nothing on the canvas is operable.
           */
          disabled={mode === "editor-preview"}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        >
          <option value="" disabled={spec.required}>
            {spec.placeholder ?? "Choose…"}
          </option>
          {(spec.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    />
  )
}
