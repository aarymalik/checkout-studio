"use client"

import { createContext, useContext } from "react"
import type { ReactElement, ReactNode } from "react"
import type { VariableDefinition } from "@checkout-studio/schema"

/**
 * `$var` bindings.
 *
 * A prop may be bound to a value supplied at render time rather than written
 * into the page: `{ "$var": "order.total" }`. The document declares what each
 * variable is and where it comes from; the *values* come from whoever is
 * rendering — the checkout plugin supplies the order, the forms plugin supplies
 * field values.
 *
 * The renderer resolves bindings before a component sees them, so a component
 * never handles a reference. This provider is for the interactive components
 * that need a value to change after the first paint: a total that updates when
 * a coupon is applied cannot have been baked into the HTML.
 */

export interface VariableContextValue {
  /** What the document declares: source, type, fallback. */
  definitions: Readonly<Record<string, VariableDefinition>>
  /** What the sources currently hold. */
  values: Readonly<Record<string, unknown>>
}

const VariableContext = createContext<VariableContextValue | null>(null)

export interface VariableProviderProps extends VariableContextValue {
  children: ReactNode
}

export function VariableProvider({
  definitions,
  values,
  children,
}: VariableProviderProps): ReactElement {
  return (
    <VariableContext.Provider value={{ definitions, values }}>{children}</VariableContext.Provider>
  )
}

export function useVariables(): VariableContextValue {
  const context = useContext(VariableContext)

  if (context === null) {
    throw new Error("useVariables must be called inside a rendered checkout.")
  }

  return context
}

/**
 * One variable's value.
 *
 * Falls back to the declared fallback, then to undefined. A variable whose
 * source has not answered yet is not an error: an order total arrives after the
 * cart does, and a component rendering its fallback in the meantime is the
 * point of having one.
 */
export function useVariable(name: string): unknown {
  const { definitions, values } = useVariables()

  if (Object.hasOwn(values, name)) return values[name]

  return definitions[name]?.fallback
}
