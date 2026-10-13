"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement, RefObject } from "react"

import { Field } from "../../form/Field"
import { partsOf } from "./parts"

/**
 * Address.
 *
 * Several fields that arrive as one component. Each part is a `Field` with its
 * own label, error and registration — so an address's parts are ordinary
 * fields in every way that matters, and nothing in the form layer knows this
 * component is a composite.
 *
 * Not a `<fieldset>` around them. A fieldset's `<legend>` becomes part of every
 * control's accessible name inside it, so a screen reader would announce
 * "Delivery address Town or city" for the city — and the parts already say what
 * they are. A heading above the group is the merchant's to add if they want
 * one, with a Heading component.
 */
export function AddressRenderer({
  className,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  return (
    <div className={className}>
      {partsOf(props, node.id).map((spec) => (
        <Field
          key={spec.name}
          spec={spec}
          className=""
          control={({ id, value, describedBy, invalid, ref, onChange, onBlur }) => (
            <input
              id={id}
              ref={ref as RefObject<HTMLInputElement | null>}
              name={spec.name}
              type="text"
              value={value}
              required={spec.required}
              aria-required={spec.required}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={describedBy}
              /*
               * The parts a browser can fill in for somebody. An address is the
               * most tedious thing on a checkout and the one autofill is best
               * at, so each part says what it is in the vocabulary browsers
               * already use.
               */
              autoComplete={AUTOCOMPLETE[spec.name.split(".").pop() ?? ""] ?? "off"}
              readOnly={mode === "editor-preview"}
              onChange={(event) => onChange(event.target.value)}
              onBlur={onBlur}
            />
          )}
        />
      ))}
    </div>
  )
}

/** What each part is, in the names a browser's autofill knows. */
const AUTOCOMPLETE: Readonly<Record<string, string>> = {
  line1: "address-line1",
  line2: "address-line2",
  city: "address-level2",
  region: "address-level1",
  postcode: "postal-code",
}
