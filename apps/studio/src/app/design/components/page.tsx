import { notFound } from "next/navigation"
import Link from "next/link"

import { getEnv } from "@/env"
import { COMPONENT_CASES } from "./cases"
import { ComponentCase } from "./ComponentCase"

/**
 * The plugin component gallery.
 *
 * The sibling of `/design`, which shows the studio's own interface. This shows
 * what a document is made of, rendered the way a published page renders it.
 *
 * Not part of the product: in production the route does not exist, and anyone
 * who finds the URL gets a 404 rather than a page of scaffolding.
 */

export const dynamic = "force-dynamic"

export default async function ComponentGallery({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; mode?: string; chrome?: string }>
}) {
  if (getEnv().NODE_ENV === "production") notFound()

  const { case: requested, mode, chrome } = await searchParams
  const current =
    COMPONENT_CASES.find((testCase) => testCase.id === requested) ?? COMPONENT_CASES[0]

  if (current === undefined) notFound()

  const colorMode = mode === "dark" ? "dark" : "light"

  /*
   * Without the list, when asked.
   *
   * The nav is 256px of this page's width, which at the mobile frame leaves a
   * component 134px to lay itself out in — so a photograph taken with it is a
   * photograph of a squeezed column rather than of the component at the width
   * somebody designed for. The visual suite asks for the case alone; a person
   * browsing keeps the list.
   */
  if (chrome === "0") {
    return (
      <main className="min-h-dvh">
        <ComponentCase id={current.id} colorMode={colorMode} />
      </main>
    )
  }

  return (
    <div className="flex min-h-dvh">
      <nav aria-label="Cases" className="w-64 shrink-0 border-r border-border p-4">
        <ul className="flex flex-col gap-1">
          {COMPONENT_CASES.map((testCase) => (
            <li key={testCase.id}>
              <Link
                href={`/design/components?case=${testCase.id}`}
                aria-current={testCase.id === current.id ? "page" : undefined}
                className="block rounded-tight px-2 py-2 font-code text-caption text-foreground-muted aria-[current=page]:bg-surface-hover aria-[current=page]:text-foreground"
              >
                {testCase.id}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="min-w-0 flex-1">
        <ComponentCase id={current.id} colorMode={colorMode} />
      </main>
    </div>
  )
}
