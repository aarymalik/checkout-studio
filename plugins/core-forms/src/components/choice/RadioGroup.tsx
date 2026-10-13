"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement, RefObject } from "react"

import { Field } from "../../form/Field"
import { choiceSpecOf } from "./spec"

/**
 * Radio Group.
 *
 * ## A fieldset, because there is no single control to label
 *
 * Four radios with one question above them is four unlabelled controls unless
 * the question is a `<legend>` inside a `<fieldset>`. A screen reader then
 * announces "Delivery, radio button, Standard, 1 of 3" — the question, the
 * answer, and where in the list. A `<div>` with a heading announces "Standard,
 * radio button" and nothing about what is being asked.
 *
 * `Field` renders that shape when it is told the field is grouped.
 *
 * ## One tab stop, arrows within
 *
 * The browser's own behaviour for radios sharing a `name`, and the reason
 * nothing here manages focus: Tab enters the group and leaves it, the arrow
 * keys move between options, and that is what people already know. The only
 * thing to get right is that every radio in the group carries the same `name`,
 * which is the field's.
 */
export function RadioGroupRenderer({
  className,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  const spec = choiceSpecOf(props, node.id, "radio", "Choose one")

  return (
    <Field
      spec={spec}
      className={className}
      grouped
      control={({ id, value, describedBy, invalid, ref, onChange, onBlur }) => (
        <div>
          {(spec.options ?? []).map((option, index) => (
            <label className="ck-field-choice" key={option.value} htmlFor={`${id}-${option.value}`}>
              <input
                id={`${id}-${option.value}`}
                /*
                 * The first option carries the ref, because that is where
                 * focus goes when a submit fails on this group: focusing the
                 * third radio would move the selection to it in some browsers.
                 */
                ref={index === 0 ? (ref as RefObject<HTMLInputElement | null>) : undefined}
                className="ck-field-tick"
                type="radio"
                name={spec.name}
                value={option.value}
                checked={value === option.value}
                aria-required={spec.required}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={describedBy}
                disabled={mode === "editor-preview"}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    />
  )
}
