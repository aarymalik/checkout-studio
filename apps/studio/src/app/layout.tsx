import type { ReactNode } from "react"
import { themeScript } from "@checkout-studio/design-system"
import { INK, PAPER } from "@/components/brand/colors"
import "./globals.css"

export const metadata = {
  // A template, so every page says what it is before it says what it belongs
  // to — which is the order a browser tab truncates in.
  title: { default: "Checkout Studio", template: "%s · Checkout Studio" },
  description: "Build checkout experiences that convert.",
}

/**
 * The colour a mobile browser paints its chrome with.
 *
 * Two of them, so the bar matches the interface rather than fighting it when
 * somebody has their phone in dark mode.
 */
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAPER },
    { media: "(prefers-color-scheme: dark)", color: INK },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The pre-paint script writes data-theme and data-contrast before React
    // sees the document, so the server's markup and the client's disagree by
    // design. Suppressing the warning here is the point of the technique, not
    // a way around a mistake.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
         * Blocking and inline, ahead of every stylesheet. Resolving the theme
         * in React instead would paint the light interface first and correct
         * it a frame later — the flash of incorrect theme the spec forbids.
         */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
