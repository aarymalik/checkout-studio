"use client"

import { Component } from "react"
import type { ReactNode } from "react"
import { logger } from "@checkout-studio/observability"
import { normalizeError } from "@checkout-studio/utils"

/**
 * One boundary per plugin provider.
 *
 * A node boundary catches a component. This catches the context a plugin puts
 * around the whole tree, which is a different failure with a different cost: a
 * provider that throws takes every component depending on it with it.
 *
 * So it renders its children *without* the provider rather than rendering
 * nothing. A checkout whose analytics provider failed should still take money;
 * the components that needed the context will fail individually at their own
 * boundaries, which is a far smaller loss than a blank page.
 *
 * See docs/plugin-api.md § Error Isolation.
 */

export interface PluginErrorBoundaryProps {
  /** The provider's id, for the report. */
  pluginId: string
  /** Rendered with the provider. */
  children: ReactNode
  /** Rendered without it, once it has failed. */
  fallback: ReactNode
}

interface State {
  failed: boolean
}

// eslint-disable-next-line no-restricted-syntax -- React provides no functional equivalent
export class PluginErrorBoundary extends Component<PluginErrorBoundaryProps, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(thrown: unknown): void {
    const error = normalizeError(thrown)

    logger.error("renderer.plugin.failed", { pluginId: this.props.pluginId }, error)
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
