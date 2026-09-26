import * as RadixSwitch from "@radix-ui/react-switch"
import { useId } from "react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { FieldDescription } from "./field"
import { cn } from "../lib/cn"

/**
 * A switch.
 *
 * Distinct from a checkbox in meaning, not only in appearance: a switch takes
 * effect immediately, a checkbox takes effect when the form is submitted. Radix
 * gives it `role="switch"`, which is what tells a screen reader which of the
 * two this is.
 */
export interface SwitchProps extends Omit<
  ComponentPropsWithRef<typeof RadixSwitch.Root>,
  "children"
> {
  label: ReactNode
  description?: ReactNode
}

export function Switch({ className, label, description, id, ...props }: SwitchProps) {
  const generated = useId()
  const controlId = id ?? generated
  const descriptionId = `${controlId}-description`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <RadixSwitch.Root
          id={controlId}
          aria-describedby={description === undefined ? undefined : descriptionId}
          className={cn(
            "peer relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill",
            "border border-transparent bg-surface-active",
            "transition-colors duration-fast ease-standard",
            "outline-none",
            "data-[state=checked]:bg-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        >
          <RadixSwitch.Thumb
            className={cn(
              "block size-4 rounded-pill bg-surface shadow-card",
              "transition-transform duration-fast ease-standard",
              "translate-x-0.5 data-[state=checked]:translate-x-4",
            )}
          />
        </RadixSwitch.Root>

        <label
          htmlFor={controlId}
          className="text-body text-foreground peer-disabled:opacity-50 select-none"
        >
          {label}
        </label>
      </div>

      {description === undefined ? null : (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
    </div>
  )
}
