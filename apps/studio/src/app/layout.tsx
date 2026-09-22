import type { ReactNode } from "react"
import "./globals.css"

export const metadata = {
  title: "Checkout Studio",
  description: "Build checkout experiences that convert.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
