import type { ReactElement, ReactNode } from "react"
import type { ProviderRegistration } from "@checkout-studio/plugin-sdk"
import type { AppError } from "@checkout-studio/utils"

import { PluginErrorBoundary } from "../fallback/PluginErrorBoundary"

/**
 * The plugins' context, wrapped around the tree.
 *
 * Ordered outermost first by the registry, from each provider's declared
 * dependencies — the forms provider wraps the checkout provider because
 * checkout fields are form fields. This component only folds; it never decides
 * the order, because the order is a property of what the plugins declared and
 * not of how this loop happens to be written.
 *
 * Each provider sits inside its own boundary. A provider that throws is
 * replaced by its own children, so the components that did not need its context
 * still render. A checkout whose analytics provider failed should still take
 * money.
 *
 * See docs/renderer.md § Context Providers.
 */

export interface PluginProvidersProps {
  /** Outermost first. */
  providers: readonly ProviderRegistration[]
  onError?: ((error: AppError, pluginId: string) => void) | undefined
  children: ReactNode
}

export function PluginProviders({
  providers,
  onError,
  children,
}: PluginProvidersProps): ReactElement {
  let tree = <>{children}</>

  // Innermost first, so the outermost registration ends up on the outside.
  for (const registration of [...providers].reverse()) {
    const Provider = registration.component
    const inner = tree

    tree = (
      <PluginErrorBoundary pluginId={registration.id} fallback={inner} onError={onError}>
        <Provider>{inner}</Provider>
      </PluginErrorBoundary>
    )
  }

  return tree
}
