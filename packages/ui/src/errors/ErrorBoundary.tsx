import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { normalizeError } from "@checkout-studio/utils"
import type { AppError } from "@checkout-studio/utils"
import { logger } from "@checkout-studio/observability"
import { ErrorFallback } from "./ErrorFallback"

/**
 * The boundary the other three are built from.
 *
 * A class, because `componentDidCatch` has no hook equivalent — React offers no
 * other way to stop a render error from taking the whole tree down.
 *
 * Whatever was thrown is normalised into an AppError before anything is decided
 * about it: a boundary that catches a string cannot tell whether a retry would
 * help, and a boundary that renders `String(error)` shows the reader a stack
 * trace. See docs/error-handling.md.
 */
export interface ErrorBoundaryProps {
  children: ReactNode
  /** How much of the screen this boundary covers. */
  scope: "app" | "route" | "panel"
  /** Named in the log, so a failure can be traced to a place. */
  name?: string
  /** Replaces the default fallback entirely. */
  fallback?: (error: AppError, reset: () => void) => ReactNode
  /** Called after the error is logged — to report it, or to reset some state. */
  onError?: (error: AppError, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: AppError | null
}

/*
 * The one class component in the codebase.
 *
 * React offers no hook that does what componentDidCatch does: there is no way
 * to stop a render error from unmounting the tree above it from inside a
 * function component. Every other component here is a function, and the rule
 * that says so is worth keeping for the sake of the one place it cannot hold.
 * Recorded in docs/coding-standards.md.
 */
// eslint-disable-next-line no-restricted-syntax -- React provides no functional equivalent
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(thrown: unknown): ErrorBoundaryState {
    return { error: normalizeError(thrown) }
  }

  override componentDidCatch(thrown: unknown, info: ErrorInfo): void {
    const error = normalizeError(thrown)

    logger.error(
      "ui.render.failed",
      {
        scope: this.props.scope,
        boundary: this.props.name ?? this.props.scope,
        // The component stack is the only clue to where a render threw, and it
        // is not in the error itself.
        componentStack: info.componentStack ?? "",
      },
      error,
    )

    this.props.onError?.(error, info)
  }

  private readonly reset = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state

    if (error === null) return this.props.children

    if (this.props.fallback !== undefined) return this.props.fallback(error, this.reset)

    return <ErrorFallback error={error} onReset={this.reset} scope={this.props.scope} />
  }
}

/**
 * The whole application.
 *
 * The last boundary before a blank page. It offers a reload, because at this
 * level there may be nothing left worth preserving.
 */
export function AppErrorBoundary(props: Omit<ErrorBoundaryProps, "scope">) {
  return <ErrorBoundary scope="app" name={props.name ?? "app"} {...props} />
}

/**
 * One route.
 *
 * Keeps the shell — the toolbar, the panels, the reader's place in the product —
 * while the route that failed offers to try again.
 */
export function RouteErrorBoundary(props: Omit<ErrorBoundaryProps, "scope">) {
  return <ErrorBoundary scope="route" name={props.name ?? "route"} {...props} />
}

/**
 * One panel.
 *
 * The reason the editor survives a broken inspector: the canvas keeps
 * rendering, the work stays on screen, and one region says it failed. A single
 * boundary around the whole editor would turn every panel's bug into a blank
 * page.
 */
export function PanelErrorBoundary(props: Omit<ErrorBoundaryProps, "scope">) {
  return <ErrorBoundary scope="panel" name={props.name ?? "panel"} {...props} />
}
