import * as RadixSlider from "@radix-ui/react-slider"
import { useId } from "react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { FieldDescription, FieldShell } from "./field"
import { cn } from "../lib/cn"

/**
 * A slider.
 *
 * Arrow keys move by one step, Page Up and Page Down by ten, Home and End to
 * the ends — all from Radix. The current value is shown beside the label rather
 * than only in a tooltip on the thumb: a value you can only see while dragging
 * is a value you cannot check.
 */
export interface SliderProps extends Omit<
  ComponentPropsWithRef<typeof RadixSlider.Root>,
  "children"
> {
  label: string
  labelHidden?: boolean
  description?: ReactNode
  /** Renders the current value beside the label, e.g. as a percentage. */
  formatValue?: (value: number[]) => string
}

export function Slider({
  className,
  label,
  labelHidden = false,
  description,
  formatValue,
  ...props
}: SliderProps) {
  const id = useId()
  const descriptionId = `${id}-description`
  const values = props.value ?? props.defaultValue ?? [0]

  /*
   * The thumb is the slider, not the root.
   *
   * Radix puts role="slider" on each thumb, so a name on the root names
   * nothing: axe reports the control as unnamed, and a screen reader announces
   * "slider" with no idea what it adjusts. A range has two of them, and
   * "Price" twice is no more use than nothing — they are named for the end they
   * hold.
   */
  const thumbLabel = (index: number): string => {
    if (values.length === 1) return label
    if (values.length === 2) return `${label} ${index === 0 ? "minimum" : "maximum"}`
    return `${label} ${index + 1}`
  }

  return (
    <FieldShell>
      <div className="flex items-baseline justify-between gap-2">
        {/*
          A span rather than a label: there is no labelable element to point at
          — the control is a span with a role — and a `for` that resolves to
          nothing is worse than no label at all. The name reaches the control
          through the thumb's aria-label.
        */}
        <span className={cn("text-small font-medium text-foreground", labelHidden && "sr-only")}>
          {label}
        </span>
        {formatValue === undefined ? null : (
          <span className="text-caption text-foreground-muted tabular-nums">
            {formatValue(values)}
          </span>
        )}
      </div>

      <RadixSlider.Root
        id={id}
        className={cn("relative flex w-full touch-none items-center select-none", className)}
        {...props}
      >
        <RadixSlider.Track className="relative h-1 w-full grow rounded-pill bg-surface-active">
          <RadixSlider.Range className="absolute h-full rounded-pill bg-primary" />
        </RadixSlider.Track>

        {values.map((_, index) => (
          <RadixSlider.Thumb
            // The index is the identity here: a thumb is the nth handle of the
            // slider and has nothing else to be keyed by.
            key={index}
            aria-label={thumbLabel(index)}
            aria-describedby={description === undefined ? undefined : descriptionId}
            className={cn(
              "block size-4 rounded-pill border border-border-strong bg-surface shadow-card",
              "transition-colors duration-fast ease-standard outline-none",
              "disabled:opacity-50",
            )}
          />
        ))}
      </RadixSlider.Root>

      {description === undefined ? null : (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
    </FieldShell>
  )
}
