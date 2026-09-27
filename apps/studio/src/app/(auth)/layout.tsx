import type { ReactNode } from "react"

/**
 * The frame every authentication screen sits in.
 *
 * One column, centred, nothing else on the page. These screens have exactly one
 * job each, and a navigation bar offering seven other things is a navigation
 * bar offering somebody a way to not finish signing in.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <main className="w-full max-w-sm">{children}</main>
    </div>
  )
}
