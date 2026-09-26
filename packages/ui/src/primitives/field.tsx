import { useId } from "react"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * The parts every labelled control shares.
 *
 * Kept in one place because the wiring is where accessibility goes wrong: an
 * input whose label is not associated, or whose error is rendered but never
 * referenced, looks correct and tells a screen reader nothing. Input, Textarea
 * and Select all compose these rather than each repeating the `aria-describedby`
 * bookkeeping.
 */

export interface FieldProps {
  /**
   * The visible label.
   *
   * Required, not optional. docs/ui-guidelines.md: never use a placeholder as a
   * label — it disappears the moment someone types, and it is not announced.
   */
  label: string
  /** Hidden visually but still announced, for a control whose context is obvious. */
  labelHidden?: boolean | undefined
  /** Guidance shown under the control, before anything goes wrong. */
  description?: ReactNode | undefined
  /**
   * What is wrong.
   *
   * Rendered as text, not only as a colour: docs/design-system.md forbids
   * relying on colour alone for validation, and roughly one reader in twelve
   * cannot use it.
   */
  error?: ReactNode | undefined
}

/** The ids and ARIA attributes a labelled control needs, derived once. */
export function useFieldAria(props: FieldProps & { id?: string | undefined }) {
  const generated = useId()
  const id = props.id ?? generated
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`

  const describedBy = [
    props.description === undefined ? undefined : descriptionId,
    props.error === undefined ? undefined : errorId,
  ]
    .filter(Boolean)
    .join(" ")

  return {
    id,
    descriptionId,
    errorId,
    control: {
      id,
      "aria-describedby": describedBy === "" ? undefined : describedBy,
      // A control in an error state says so, rather than looking red.
      "aria-invalid": props.error === undefined ? undefined : (true as const),
    },
  }
}

/**
 * `visuallyHidden` rather than `hidden`: the HTML attribute of that name
 * removes the element from the accessibility tree entirely, which is the
 * opposite of what a visually hidden label is for.
 */
export function FieldLabel({
  className,
  visuallyHidden = false,
  required = false,
  ...props
}: ComponentPropsWithoutRef<"label"> & {
  visuallyHidden?: boolean | undefined
  required?: boolean | undefined
}) {
  return (
    <label
      className={cn(
        "text-small font-medium text-foreground",
        visuallyHidden && "sr-only",
        className,
      )}
      {...props}
    >
      {props.children}
      {required ? (
        // The control already carries `required`, so this is a visual cue and
        // nothing more — announcing it twice is worse than not announcing it.
        <span aria-hidden="true" className="ml-1 text-danger">
          *
        </span>
      ) : null}
    </label>
  )
}

export function FieldDescription({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("text-caption text-foreground-muted", className)} {...props} />
}

export function FieldError({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      // Announced when it appears, because validation usually arrives after the
      // reader has moved on from the control.
      role="alert"
      className={cn("text-caption text-danger", className)}
      {...props}
    />
  )
}

/** The vertical rhythm a field uses, so every form agrees. */
export function FieldShell({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />
}
