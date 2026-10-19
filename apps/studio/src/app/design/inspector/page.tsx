import { notFound } from "next/navigation"
import Link from "next/link"

import { getEnv } from "@/env"
import { INSPECTOR_CASES } from "./cases"
import { InspectorCase } from "./InspectorCase"

/**
 * The inspector gallery.
 *
 * The third of the design routes, beside the studio's own interface and the
 * components a document is made of. This one exists because the panel's faults
 * have all been faults of layout, which nothing but a picture can see.
 *
 * Not part of the product: in production the route does not exist.
 */

export const dynamic = "force-dynamic"

export default async function InspectorGallery({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; chrome?: string }>
}) {
  if (getEnv().NODE_ENV === "production") notFound()

  const { case: requested, chrome } = await searchParams
  const current =
    INSPECTOR_CASES.find((testCase) => testCase.id === requested) ?? INSPECTOR_CASES[0]

  if (current === undefined) notFound()

  // Without the list, when asked: the nav would be most of the frame, and the
  // panel is the subject.
  if (chrome === "0") {
    return (
      <main className="flex min-h-dvh justify-end bg-background">
        <InspectorCase id={current.id} />
      </main>
    )
  }

  return (
    <div className="flex min-h-dvh">
      <nav aria-label="Cases" className="w-64 shrink-0 border-r border-border p-4">
        <ul className="flex flex-col gap-1">
          {INSPECTOR_CASES.map((testCase) => (
            <li key={testCase.id}>
              <Link
                href={`/design/inspector?case=${testCase.id}`}
                aria-current={testCase.id === current.id ? "page" : undefined}
                className="block rounded-tight px-2 py-2 font-code text-caption text-foreground-muted aria-[current=page]:bg-surface-hover aria-[current=page]:text-foreground"
              >
                {testCase.id}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex min-w-0 flex-1 justify-end">
        <InspectorCase id={current.id} />
      </main>
    </div>
  )
}
