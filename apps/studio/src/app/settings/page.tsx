import Link from "next/link"
import { Keyboard, ShieldCheck } from "lucide-react"

import { requireSession } from "@/lib/session"

export const metadata = { title: "Settings" }

const SECTIONS = [
  {
    href: "/settings/keyboard",
    icon: Keyboard,
    title: "Keyboard",
    description: "Change a shortcut, switch one off, or look one up.",
  },
  {
    href: "/settings/sessions",
    icon: ShieldCheck,
    title: "Active sessions",
    description: "Every browser signed in to your account, and how to end one.",
  },
]

/**
 * Settings.
 *
 * Two sections, because two exist. The rest — profile, billing, domains, team —
 * arrive with the features they configure, and a link to an empty page is worse
 * than no link.
 */
export default async function SettingsPage() {
  await requireSession("/settings")

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-h2 font-semibold text-foreground">Settings</h1>

      <ul className="flex flex-col gap-2">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="flex items-start gap-4 rounded-card border border-border bg-surface p-4 outline-none transition-colors duration-fast ease-standard hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <section.icon aria-hidden="true" className="mt-1 size-4 text-foreground-muted" />
              <span className="flex flex-col gap-1">
                <span className="text-body font-medium text-foreground">{section.title}</span>
                <span className="text-caption text-foreground-muted">{section.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
