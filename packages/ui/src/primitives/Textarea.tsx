import type { ComponentPropsWithRef } from "react"
import { FieldDescription, FieldError, FieldLabel, FieldShell, useFieldAria } from "./field"
import type { FieldProps } from "./field"
import { cn } from "../lib/cn"

/**
 * A multi-line text input.
 *
 * Shares its labelling, description and error wiring with Input rather than
 * reimplementing it — that wiring is where forms go wrong, and it is worth
 * having in exactly one place.
 */
export interface TextareaProps extends ComponentPropsWithRef<"textarea">, FieldProps {}

export function Textarea({
  className,
  label,
  labelHidden,
  description,
  error,
  required,
  rows = 4,
  ...props
}: TextareaProps) {
  const field = useFieldAria({ label, description, error, id: props.id })

  return (
    <FieldShell>
      <FieldLabel htmlFor={field.id} visuallyHidden={labelHidden} required={required === true}>
        {label}
      </FieldLabel>

      <textarea
        rows={rows}
        className={cn(
          "w-full min-w-0 bg-surface text-foreground text-body",
          "rounded-control border border-border-strong px-3 py-2",
          "placeholder:text-foreground-subtle",
          "transition-colors duration-fast ease-standard",
          "outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Vertical only: a textarea that can be dragged wider than its column
          // breaks the layout around it.
          "resize-y",
          error !== undefined && "border-danger",
          className,
        )}
        required={required}
        {...field.control}
        {...props}
      />

      {description === undefined ? null : (
        <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
      )}
      {error === undefined ? null : <FieldError id={field.errorId}>{error}</FieldError>}
    </FieldShell>
  )
}
