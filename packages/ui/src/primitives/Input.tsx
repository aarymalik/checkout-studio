import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"
import { FieldDescription, FieldError, FieldLabel, FieldShell, useFieldAria } from "./field"
import type { FieldProps } from "./field"
import { cn } from "../lib/cn"

/**
 * A single-line text input.
 *
 * Always labelled, and the label is a prop rather than the caller's problem:
 * an unlabelled input is the most common accessibility failure there is, and
 * making it impossible costs nothing.
 *
 * See docs/design-system.md § Inputs and docs/ui-guidelines.md § Forms.
 */
const input = cva(
  [
    "w-full min-w-0 bg-surface text-foreground",
    "rounded-control border border-border-strong",
    "placeholder:text-foreground-subtle",
    "transition-colors duration-fast ease-standard",
    "outline-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
    // A file input has its own button; the rest is ours.
    "file:mr-3 file:border-0 file:bg-transparent file:text-small file:font-medium",
  ],
  {
    variants: {
      size: {
        sm: "h-control-sm px-2 text-small",
        md: "h-control-md px-3 text-body",
        lg: "h-control-lg px-4 text-body-lg",
      },
      invalid: {
        // Not colour alone: the error text below carries the message, and
        // aria-invalid carries it to a screen reader.
        true: "border-danger",
        false: "",
      },
    },
    defaultVariants: { size: "md", invalid: false },
  },
)

export interface InputProps
  extends
    Omit<ComponentPropsWithRef<"input">, "size">,
    Omit<VariantProps<typeof input>, "invalid">,
    FieldProps {}

export function Input({
  className,
  size,
  label,
  labelHidden,
  description,
  error,
  required,
  ...props
}: InputProps) {
  const field = useFieldAria({ label, description, error, id: props.id })

  return (
    <FieldShell>
      <FieldLabel htmlFor={field.id} visuallyHidden={labelHidden} required={required === true}>
        {label}
      </FieldLabel>

      <input
        className={cn(input({ size, invalid: error !== undefined }), className)}
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

export { input as inputVariants }
