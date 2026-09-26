import * as RadixSelect from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { FieldDescription, FieldError, FieldLabel, FieldShell, useFieldAria } from "./field"
import type { FieldProps } from "./field"
import { cn } from "../lib/cn"

/**
 * A single-choice select.
 *
 * Radix rather than a native `<select>`: the options need to be styled, grouped
 * and scrolled consistently across platforms, which a native control does not
 * allow. Radix keeps what the native control gets right — typeahead, arrow keys,
 * Home and End, Escape to close, the value announced on change — which is the
 * only reason replacing it is defensible.
 *
 * Opens on click and on Enter, closes on Escape, and returns focus to the
 * trigger. docs/design-system.md § Dropdowns: keyboard accessible, maximum
 * height with scrolling.
 */
export interface SelectProps extends ComponentPropsWithRef<typeof RadixSelect.Root>, FieldProps {
  /** Shown when nothing is chosen. Not a substitute for the label. */
  placeholder?: string
  /** The trigger's width and height. */
  size?: "sm" | "md" | "lg"
  className?: string
  children: ReactNode
}

const TRIGGER_SIZES = {
  sm: "h-control-sm px-2 text-small",
  md: "h-control-md px-3 text-body",
  lg: "h-control-lg px-4 text-body-lg",
} as const

export function Select({
  label,
  labelHidden,
  description,
  error,
  placeholder = "Select…",
  size = "md",
  className,
  children,
  ...props
}: SelectProps) {
  const field = useFieldAria({ label, description, error })

  return (
    <FieldShell>
      <FieldLabel htmlFor={field.id} visuallyHidden={labelHidden}>
        {label}
      </FieldLabel>

      <RadixSelect.Root {...props}>
        <RadixSelect.Trigger
          id={field.id}
          aria-describedby={field.control["aria-describedby"]}
          aria-invalid={field.control["aria-invalid"]}
          className={cn(
            "inline-flex w-full items-center justify-between gap-2",
            "rounded-control border border-border-strong bg-surface text-foreground",
            "transition-colors duration-fast ease-standard outline-none",
            "data-[placeholder]:text-foreground-subtle",
            "disabled:cursor-not-allowed disabled:opacity-50",
            TRIGGER_SIZES[size],
            error !== undefined && "border-danger",
            className,
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDown aria-hidden="true" className="size-4 text-foreground-muted" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            // Anchored to the trigger rather than covering it, so the reader can
            // still see what they are changing.
            position="popper"
            sideOffset={4}
            className={cn(
              "z-50 max-h-64 min-w-(--radix-select-trigger-width) overflow-hidden",
              "rounded-control border border-border bg-surface-raised shadow-dropdown",
            )}
          >
            <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>

      {description === undefined ? null : (
        <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
      )}
      {error === undefined ? null : <FieldError id={field.errorId}>{error}</FieldError>}
    </FieldShell>
  )
}

export type SelectOptionProps = ComponentPropsWithRef<typeof RadixSelect.Item>

export function SelectOption({ className, children, ...props }: SelectOptionProps) {
  return (
    <RadixSelect.Item
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-tight py-2 pr-2 pl-8",
        "text-body text-foreground select-none outline-none",
        // Highlight follows the keyboard as well as the pointer: Radix sets
        // data-highlighted for both, so arrow keys look like hover.
        "data-highlighted:bg-surface-hover",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <RadixSelect.ItemIndicator>
          <Check aria-hidden="true" className="size-3.5 text-primary" strokeWidth={3} />
        </RadixSelect.ItemIndicator>
      </span>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  )
}

export interface SelectGroupProps extends ComponentPropsWithRef<typeof RadixSelect.Group> {
  label: string
}

/** A titled section of options. docs/design-system.md § Context Menus: grouping. */
export function SelectGroup({ label, children, ...props }: SelectGroupProps) {
  return (
    <RadixSelect.Group {...props}>
      <RadixSelect.Label className="px-2 py-2 text-caption text-foreground-subtle">
        {label}
      </RadixSelect.Label>
      {children}
    </RadixSelect.Group>
  )
}

export function SelectSeparator({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixSelect.Separator>) {
  return <RadixSelect.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
}
