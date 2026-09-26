import { AlertTriangle } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import type { AppError } from "@checkout-studio/utils"
import { Button } from "../primitives/Button"
import { cn } from "../lib/cn"

/**
 * Something failed, said in a way a reader can act on.
 *
 * Takes an AppError and shows its `userMessage` — never its `message`, which is
 * written for engineers and may name a table. The error model already decided
 * what a reader should see and what they can do about it; this renders that
 * decision rather than making a new one.
 *
 * See docs/error-handling.md.
 */
export interface ErrorStateProps extends ComponentPropsWithRef<"div"> {
  error: AppError
  /**
   * Retries the work.
   *
   * Offered only when the error says retrying could help. A retry button on a
   * fatal error is a button that fails twice.
   */
  onRetry?: () => void
  /** An action beyond retrying: go back, contact support, start again. */
  action?: ReactNode
}

export function ErrorState({ className, error, onRetry, action, ...props }: ErrorStateProps) {
  const retryable =
    error.recoverability === "retryable" || error.recoverability === "user-retryable"
  const showRetry = onRetry !== undefined && retryable

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card p-8 text-center",
        className,
      )}
      {...props}
    >
      <AlertTriangle aria-hidden="true" className="size-8 text-danger" />

      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-foreground">{error.userMessage}</p>

        {error.details === undefined || error.details.length === 0 ? null : (
          // Field-level detail, when the failure was a validation one: naming
          // what is wrong beats saying that something is.
          <ul className="flex flex-col gap-1 text-small text-foreground-muted">
            {error.details.map((detail) => (
              <li key={`${detail.path}:${detail.code}`}>{detail.message}</li>
            ))}
          </ul>
        )}
      </div>

      {showRetry || action !== undefined ? (
        <div className="flex gap-2">
          {showRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              {error.remediation?.label ?? "Try again"}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  )
}
