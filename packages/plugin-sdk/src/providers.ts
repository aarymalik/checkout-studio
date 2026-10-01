import type { ComponentType, ReactNode } from "react"

/**
 * The slot through which plugins contribute React context.
 *
 * The renderer provides a theme and the variable bindings, and nothing else. A
 * cart, a customer, a form's state — those belong to the plugins that
 * understand them, and the renderer's job is to put their providers around the
 * tree in the right order.
 *
 * The order matters and is derived, not configured by hand: the forms provider
 * has to wrap the checkout provider, because checkout fields are form fields.
 * The checkout plugin declares `dependsOn: ["forms"]` and the sort does the
 * rest.
 *
 * See docs/renderer.md § Context Providers.
 */

export interface ProviderProps {
  children: ReactNode
}

export interface ProviderRegistration {
  /** Unique across the installation. Conventionally the plugin's id. */
  id: string
  component: ComponentType<ProviderProps>
  /**
   * Providers that must wrap this one.
   *
   * Every id named here must be registered, or the sort fails: a provider whose
   * dependency silently went missing would render, and then break inside a
   * component that expected a context it never got.
   */
  dependsOn?: readonly string[]
}

export type ProviderOrderError =
  { code: "cycle"; ids: readonly string[] } | { code: "missing"; id: string; dependency: string }

export type ProviderOrderResult =
  { ok: true; order: readonly ProviderRegistration[] } | { ok: false; error: ProviderOrderError }

/**
 * Sorts providers outermost first.
 *
 * A dependency comes out before the provider that named it, so wrapping the
 * tree is a right fold over the result. Registration order is preserved among
 * providers that do not constrain each other, which keeps the output stable and
 * therefore the markup stable.
 *
 * Ids are assumed unique. The registry refuses a duplicate at registration,
 * where it can still name the plugin responsible.
 */
export function orderProviders(
  registrations: readonly ProviderRegistration[],
): ProviderOrderResult {
  const byId = new Map<string, ProviderRegistration>()
  for (const registration of registrations) byId.set(registration.id, registration)

  for (const registration of registrations) {
    for (const dependency of registration.dependsOn ?? []) {
      if (!byId.has(dependency)) {
        return {
          ok: false,
          error: { code: "missing", id: registration.id, dependency },
        }
      }
    }
  }

  const order: ProviderRegistration[] = []
  const settled = new Set<string>()
  const visiting: string[] = []

  function visit(registration: ProviderRegistration): ProviderOrderError | null {
    if (settled.has(registration.id)) return null

    const cycleAt = visiting.indexOf(registration.id)
    if (cycleAt !== -1) {
      return { code: "cycle", ids: [...visiting.slice(cycleAt), registration.id] }
    }

    visiting.push(registration.id)

    for (const dependency of registration.dependsOn ?? []) {
      const next = byId.get(dependency) as ProviderRegistration
      const error = visit(next)
      if (error !== null) return error
    }

    visiting.pop()
    settled.add(registration.id)
    order.push(registration)

    return null
  }

  for (const registration of registrations) {
    const error = visit(registration)
    if (error !== null) return { ok: false, error }
  }

  return { ok: true, order }
}
