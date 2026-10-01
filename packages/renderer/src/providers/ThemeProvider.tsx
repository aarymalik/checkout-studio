"use client"

import { createContext, useContext } from "react"
import type { ReactElement, ReactNode } from "react"
import type { Breakpoint, CheckoutTheme } from "@checkout-studio/schema"
import type { RenderMode } from "@checkout-studio/plugin-sdk"

/**
 * The theme, for interactive components.
 *
 * The tree walker does *not* read the theme from here. It threads a plain
 * context object down through arguments, because a server component cannot read
 * a client component's React context — and the walker has to run on the server
 * for static components to ship no JavaScript.
 *
 * This provider exists for the interactive leaves: a payment element that has
 * to hand Stripe an appearance object, a countdown that animates at the theme's
 * duration. They are client components, so they can read it.
 *
 * Almost nothing needs it. A component that only needs colours and sizes should
 * use the CSS variables, which is why a theme change repaints without
 * re-rendering anything at all.
 */

export interface CheckoutThemeContext {
  theme: CheckoutTheme
  mode: RenderMode
  /** Meaningful in editor preview, where one breakpoint is resolved in JavaScript. */
  breakpoint: Breakpoint
}

const ThemeContext = createContext<CheckoutThemeContext | null>(null)

export interface ThemeProviderProps extends CheckoutThemeContext {
  children: ReactNode
}

export function ThemeProvider({
  theme,
  mode,
  breakpoint,
  children,
}: ThemeProviderProps): ReactElement {
  return (
    <ThemeContext.Provider value={{ theme, mode, breakpoint }}>{children}</ThemeContext.Provider>
  )
}

/**
 * @throws when called outside a rendered checkout — which means a component was
 *   mounted somewhere the renderer did not put it, and the cause is worth
 *   naming rather than returning a default theme nobody chose.
 */
export function useCheckoutTheme(): CheckoutThemeContext {
  const context = useContext(ThemeContext)

  if (context === null) {
    throw new Error("useCheckoutTheme must be called inside a rendered checkout.")
  }

  return context
}
