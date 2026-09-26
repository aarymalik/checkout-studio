import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * A message about the state of something.
 *
 * Carried by an icon, a title and the text — never by colour alone. Roughly one
 * reader in twelve cannot use the colour, and nobody can use it in a greyscale
 * print or a high-contrast theme that has flattened it.
 *
 * Danger and warning are announced assertively, because they usually appear in
 * response to something the reader just did. Info and success report themselves
 * politely and wait their turn.
 */
const alert = cva(["flex gap-3 rounded-card border p-4", "text-body"], {
  variants: {
    variant: {
      info: "border-border bg-primary-subtle text-foreground",
      success: "border-border bg-success-subtle text-foreground",
      warning: "border-border bg-warning-subtle text-foreground",
      danger: "border-border bg-danger-subtle text-foreground",
    },
  },
  defaultVariants: { variant: "info" },
})

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const

const ICON_COLORS = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const

export interface AlertProps
  extends Omit<ComponentPropsWithRef<"div">, "title">, VariantProps<typeof alert> {
  /** The one line that says what happened. */
  title: ReactNode
  /** Called when the reader dismisses it. Omit for an alert that stays. */
  onDismiss?: () => void
}

export function Alert({
  className,
  variant = "info",
  title,
  onDismiss,
  children,
  ...props
}: AlertProps) {
  const Icon = ICONS[variant ?? "info"]
  const assertive = variant === "danger" || variant === "warning"

  return (
    <div
      role={assertive ? "alert" : "status"}
      className={cn(alert({ variant }), className)}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-1 size-4 shrink-0", ICON_COLORS[variant ?? "info"])}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{title}</p>
        {children === undefined ? null : <div className="text-foreground-muted">{children}</div>}
      </div>

      {onDismiss === undefined ? null : (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className={cn(
            "-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center",
            "rounded-tight text-foreground-muted",
            "transition-colors duration-fast ease-standard outline-none",
            "hover:bg-surface-hover hover:text-foreground",
          )}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  )
}
