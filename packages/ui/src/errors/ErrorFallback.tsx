import type { AppError } from "@checkout-studio/utils"
import { Button } from "../primitives/Button"
import { ErrorState } from "../feedback/ErrorState"
import { cn } from "../lib/cn"

/**
 * What a boundary shows once something has thrown.
 *
 * One fallback for all three boundaries, differing only in how much of the
 * screen it fills and what it offers. Keeping it in one place means the wording
 * and the actions cannot drift between "the panel broke" and "the page broke".
 */
export interface ErrorFallbackProps {
  error: AppError
  /** Re-renders the subtree. Offered when the error says a retry could help. */
  onReset?: () => void
  /** How much room the fallback has, which decides how much it says. */
  scope: "app" | "route" | "panel"
}

export function ErrorFallback({ error, onReset, scope }: ErrorFallbackProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        scope === "app" && "min-h-dvh p-8",
        scope === "route" && "min-h-96 p-8",
        scope === "panel" && "p-4",
      )}
    >
      <ErrorState
        error={error}
        // Only onRetry: `onReset` is a real DOM attribute, so passing it
        // through would quietly attach a form-reset handler to a div.
        {...(onReset === undefined ? {} : { onRetry: onReset })}
        action={
          // Only the whole application offers a reload. Reloading because one
          // panel failed throws away every unsaved change on the page.
          scope === "app" ? (
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
