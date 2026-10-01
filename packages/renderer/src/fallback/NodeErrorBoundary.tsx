"use client"

import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { logger } from "@checkout-studio/observability"
import type { RenderMode } from "@checkout-studio/plugin-sdk"
import { normalizeError } from "@checkout-studio/utils"

import { behaviourOf } from "./modes"

/**
 * One boundary per rendered node.
 *
 * The most important boundary in the product. A component that throws costs its
 * own section and nothing else — the rest of the page renders, and on a live
 * checkout the customer sees a gap where a testimonial should have been rather
 * than a page that will not load.
 *
 * It lives in the renderer rather than in `packages/ui` for two reasons: the
 * renderer may not import `ui`, and these boundaries have to exist on the
 * published page, where Studio UI never ships. The editor canvas gets them for
 * free, because the canvas renders through the renderer.
 *
 * Reporting happens before the fallback renders, and is never conditional on
 * the fallback succeeding.
 *
 * It reports by logging, and takes no callback. A published page renders on the
 * server and this is a client component, so a function prop could not reach it
 * anyway — React refuses to hand one across that boundary. The logger works in
 * both places, which makes it the one channel that reports identically wherever
 * the page was rendered. When the canvas needs per-node failures for its own UI
 * in Phase 7, it can subscribe on the client rather than pass a prop from the
 * server.
 *
 * See docs/error-handling.md § Boundaries.
 */

export interface NodeErrorBoundaryProps {
  nodeId: string
  /** The component's display name, so the editor's card can say what broke. */
  componentName: string
  className: string
  mode: RenderMode
  children: ReactNode
}

interface State {
  failed: boolean
}

// eslint-disable-next-line no-restricted-syntax -- React provides no functional equivalent
export class NodeErrorBoundary extends Component<NodeErrorBoundaryProps, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(thrown: unknown, info: ErrorInfo): void {
    // Normalised first. A boundary that catches a string cannot say whether a
    // retry would help, and one that renders `String(thrown)` shows a customer
    // a stack trace.
    const error = normalizeError(thrown)

    // Logged here as well as forwarded. A published checkout with no `onError`
    // wired would otherwise swallow a component failure in silence, which is
    // the exact failure docs/error-handling.md exists to prevent.
    logger.error(
      "renderer.node.failed",
      {
        nodeId: this.props.nodeId,
        component: this.props.componentName,
        mode: this.props.mode,
        // The only clue to where a render threw, and it is not in the error.
        componentStack: info.componentStack,
      },
      error,
    )
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    const { className, componentName, mode } = this.props

    if (!behaviourOf(mode).visibleFallbacks) {
      return <div className={className} data-ck-failed={componentName} />
    }

    return (
      <div className={className} data-ck-failed={componentName} role="note">
        <strong>{componentName}</strong>
        <span>{"This component couldn’t be displayed."}</span>
      </div>
    )
  }
}
