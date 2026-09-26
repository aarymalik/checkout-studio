import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * Nothing here yet.
 *
 * An empty list with no explanation reads as a failure. This says which of the
 * two it is — nothing created yet, or nothing matching a filter — and offers the
 * one action that changes it.
 */
export interface EmptyStateProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  /** A decorative icon. The title carries the meaning. */
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** The action that resolves the emptiness: create the first one, clear the filter. */
  action?: ReactNode
}

export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card p-8 text-center",
        className,
      )}
      {...props}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" className="text-foreground-subtle [&>svg]:size-8">
          {icon}
        </span>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-foreground">{title}</p>
        {description === undefined ? null : (
          <p className="text-small text-foreground-muted">{description}</p>
        )}
      </div>

      {action}
    </div>
  )
}
