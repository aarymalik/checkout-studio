import * as RadixRadioGroup from "@radix-ui/react-radio-group"
import { useId } from "react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { FieldDescription, FieldError, FieldLabel } from "./field"
import { cn } from "../lib/cn"

/**
 * A group of mutually exclusive choices.
 *
 * Exported as a group rather than as a lone Radio, because a radio on its own
 * is meaningless: the group owns the name, the value and the arrow-key
 * behaviour, and only one of its options can be chosen. A `Radio` component
 * that could be rendered outside a group would be an invitation to build a set
 * of checkboxes that look like radios.
 */
export interface RadioGroupProps extends ComponentPropsWithRef<typeof RadixRadioGroup.Root> {
  /** What the group as a whole is asking. Announced as the fieldset's legend. */
  label: string
  labelHidden?: boolean
  description?: ReactNode
  error?: ReactNode
}

export function RadioGroup({
  className,
  label,
  labelHidden = false,
  description,
  error,
  children,
  ...props
}: RadioGroupProps) {
  const generated = useId()
  const labelId = `${generated}-label`
  const descriptionId = `${generated}-description`
  const errorId = `${generated}-error`

  const describedBy = [
    description === undefined ? undefined : descriptionId,
    error === undefined ? undefined : errorId,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel id={labelId} visuallyHidden={labelHidden}>
        {label}
      </FieldLabel>

      <RadixRadioGroup.Root
        aria-labelledby={labelId}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={error === undefined ? undefined : true}
        className={cn("flex flex-col gap-2", className)}
        {...props}
      >
        {children}
      </RadixRadioGroup.Root>

      {description === undefined ? null : (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}

export interface RadioProps extends Omit<
  ComponentPropsWithRef<typeof RadixRadioGroup.Item>,
  "children"
> {
  label: ReactNode
  description?: ReactNode
}

export function Radio({ className, label, description, id, ...props }: RadioProps) {
  const generated = useId()
  const controlId = id ?? generated
  const descriptionId = `${controlId}-description`

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <RadixRadioGroup.Item
          id={controlId}
          aria-describedby={description === undefined ? undefined : descriptionId}
          className={cn(
            "peer mt-1 size-4 shrink-0 rounded-pill border border-border-strong bg-surface",
            "transition-colors duration-fast ease-standard",
            "outline-none",
            "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        >
          <RadixRadioGroup.Indicator className="flex size-full items-center justify-center">
            {/* A dot rather than a tick: the shape is how a reader tells a
                radio from a checkbox without reading either. */}
            <span className="size-1.5 rounded-pill bg-primary-foreground" />
          </RadixRadioGroup.Indicator>
        </RadixRadioGroup.Item>

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
    </div>
  )
}
