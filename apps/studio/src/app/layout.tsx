import type { ReactNode } from "react"
import { themeScript } from "@checkout-studio/design-system"
import "./globals.css"

export const metadata = {
  title: "Checkout Studio",
  description: "Build checkout experiences that convert.",
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
