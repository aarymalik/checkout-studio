import type { ReactNode } from "react"
import "./globals.css"

export const metadata = {
  title: "Checkout",
  description: "Secure checkout.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
