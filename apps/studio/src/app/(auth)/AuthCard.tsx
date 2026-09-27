import type { ReactNode } from "react"

/**
 * The card an authentication form sits on.
 *
 * The heading is an h1 because each of these screens is its own page with one
 * subject. A page whose only heading is an h2 leaves a screen reader looking
 * for the h1 that explains what it is.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 rounded-card border border-border bg-surface p-8 shadow-card">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 font-semibold text-foreground">{title}</h1>
        {description === undefined ? null : (
          <p className="text-body text-foreground-muted">{description}</p>
        )}
      </div>

      {children}

      {footer === undefined ? null : <p className="text-small text-foreground-muted">{footer}</p>}
    </div>
  )
}
