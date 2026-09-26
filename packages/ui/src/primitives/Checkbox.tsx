import * as RadixCheckbox from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { useId } from "react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { FieldDescription, FieldError } from "./field"
import { cn } from "../lib/cn"

/**
 * A checkbox.
 *
 * Built on Radix so that the indeterminate state, the hidden native input that
 * makes it work inside a form, and the space-to-toggle behaviour are handled by
 * something that has already been tested against real assistive technology.
 *
 * The box is a token-styled indicator; the real input is present and hidden,
 * which is what lets the control participate in form submission and validation.
 */
export interface CheckboxProps extends Omit<
  ComponentPropsWithRef<typeof RadixCheckbox.Root>,
  "children"
> {
  /** The visible label. A checkbox without one is a mystery. */
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
}

export function Checkbox({ className, label, description, error, id, ...props }: CheckboxProps) {
  const generated = useId()
  const controlId = id ?? generated
  const descriptionId = `${controlId}-description`
  const errorId = `${controlId}-error`

  const describedBy = [
    description === undefined ? undefined : descriptionId,
    error === undefined ? undefined : errorId,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <RadixCheckbox.Root
          id={controlId}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          aria-invalid={error === undefined ? undefined : true}
          className={cn(
            // Tight radius rather than the control radius: at 16px square, 12px
            // of rounding is a circle.
            "peer size-4 shrink-0 rounded-tight border border-border-strong bg-surface",
            // Aligns the box with the first line of the label rather than the
            // middle of a wrapped paragraph.
            "mt-1",
            "transition-colors duration-fast ease-standard",
            "outline-none",
            "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
            "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error !== undefined && "border-danger",
            className,
          )}
          {...props}
        >
          <RadixCheckbox.Indicator className="flex items-center justify-center text-primary-foreground">
            {props.checked === "indeterminate" ? (
              <Minus aria-hidden="true" className="size-3" strokeWidth={3} />
            ) : (
              <Check aria-hidden="true" className="size-3" strokeWidth={3} />
            )}
          </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>

        <label
          htmlFor={controlId}
          className="text-body text-foreground peer-disabled:opacity-50 select-none"
        >
          {label}
        </label>
      </div>

      {description === undefined ? null : (
        <FieldDescription id={descriptionId} className="ml-6">
          {description}
        </FieldDescription>
      )}
      {error === undefined ? null : (
        <FieldError id={errorId} className="ml-6">
          {error}
        </FieldError>
      )}
    </div>
  )
}
