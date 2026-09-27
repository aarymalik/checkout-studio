import Link from "next/link"
import type { ReactNode } from "react"
import { Wordmark } from "@/components/brand/Logo"

/**
 * The frame every authentication screen sits in.
 *
 * One column, centred, nothing else on the page. These screens have exactly one
 * job each, and a navigation bar offering seven other things is a navigation bar
 * offering somebody a way to not finish signing in.
 *
 * Behind the card, two soft fields of the brand colour. Fixed, not moving: they
 * are there so the page reads as considered rather than unfinished, and
 * docs/design-system.md is explicit that nothing animates for decoration. A
 * background that drifts is a background somebody's eye keeps returning to
 * while they are trying to type a password.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background p-6">
      {/* Decoration, and marked as such: there is nothing here to announce. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 size-96 rounded-pill bg-primary/20 blur-3xl" />
        <div className="absolute -right-24 -bottom-24 size-96 rounded-pill bg-primary/10 blur-3xl" />
      </div>

      <main className="relative flex w-full max-w-sm flex-col gap-8">
        <Link href="/" className="self-center rounded-tight">
          <Wordmark />
        </Link>

        {children}
      </main>
    </div>
  )
}
