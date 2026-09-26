import { notFound } from "next/navigation"
import Link from "next/link"
import { getEnv } from "@/env"
import { CASES } from "./cases"
import { GalleryCase } from "./GalleryCase"

/**
 * The component gallery.
 *
 * Every component in every variant, so the visual suite has something to
 * photograph. Not part of the product: in production this route does not exist,
 * and anyone who finds the URL gets a 404 rather than a page of scaffolding.
 *
 * One case per URL, deliberately. Overlays render into a portal at the end of
 * the document rather than inside the element that asked for them, so a page
 * showing every case at once would pile a dialog, a menu, a palette and a
 * popover on top of each other — and a screenshot of the case's own element
 * would miss them entirely. A page each means a full-page screenshot is exactly
 * one component.
 */

/*
 * Never prerendered.
 *
 * The production guard reads the validated environment, and prerendering runs
 * at build time — where there are no credentials, and should not need to be any
 * to build a page that 404s in production anyway.
 */
export const dynamic = "force-dynamic"
export default async function DesignGallery({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>
}) {
  if (getEnv().NODE_ENV === "production") notFound()

  const { case: requested } = await searchParams
  const current = CASES.find((testCase) => testCase.id === requested) ?? CASES[0]

  if (current === undefined) notFound()

  return (
    <div className="flex min-h-dvh">
      <nav aria-label="Cases" className="w-64 shrink-0 border-r border-border p-4">
        <ul className="flex flex-col gap-1">
          {CASES.map((testCase) => (
            <li key={testCase.id}>
              <Link
                href={`/design?case=${testCase.id}`}
                aria-current={testCase.id === current.id ? "page" : undefined}
                className="block rounded-tight px-2 py-2 font-code text-caption text-foreground-muted aria-[current=page]:bg-surface-hover aria-[current=page]:text-foreground"
              >
                {testCase.id}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex flex-1 items-start p-8">
        <GalleryCase id={current.id} />
      </main>
    </div>
  )
}
