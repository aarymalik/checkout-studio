import { notFound } from "next/navigation"
import { listPages, readDraft, resolveTheme } from "@checkout-studio/api"
import { preferenceRepository, projectRepository } from "@checkout-studio/database"
import { normalizeKeymap, normalizeLayout } from "@checkout-studio/editor"

import { PagesPanel } from "@/studio/PagesPanel"
import { StudioShell } from "@/studio/StudioShell"
import { requestPlatform } from "@/lib/platform"
import { requireSession } from "@/lib/session"

/**
 * The editor.
 *
 * Everything the shell needs is resolved here rather than fetched after
 * hydration: the panel layout, the keymap, the page list and the page itself.
 * Fetching them in the browser would paint a default frame and then move it,
 * which is the layout jump docs/ui-guidelines.md forbids.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { projectId } = await params
  const { page: requestedPageId } = await searchParams
  const session = await requireSession(`/projects/${projectId}`)
  const tenant = { userId: session.userId, projectId }

  const [project, preferences, platform, pages] = await Promise.all([
    projectRepository.findById(tenant, projectId),
    preferenceRepository.all(tenant),
    requestPlatform(),
    listPages(tenant),
  ])

  // A project belonging to somebody else answers the same way as one that never
  // existed, because telling the two apart tells the caller something.
  if (project === null) notFound()

  /*
   * The page in the URL, or the most recently changed one.
   *
   * A requested page that is not in the list is ignored rather than refused: a
   * stale link — a page deleted in another tab, most often — should open the
   * project, not an error.
   */
  const current = pages.find((item) => item.id === requestedPageId) ?? pages[0] ?? null

  /*
   * The document and its theme, both resolved here.
   *
   * On the server rather than after hydration, so the first paint is the page
   * rather than an empty frame that fills in — which is the layout jump
   * docs/ui-guidelines.md forbids.
   *
   * A draft that will not parse reads as no page at all. The canvas then shows
   * its empty state, which is honest: we have a row we cannot open, and
   * handing the store something it would corrupt further is worse.
   */
  const draft = current === null ? null : await readDraft(tenant, current.id)
  const page =
    draft === null
      ? null
      : {
          document: draft.document,
          theme: await resolveTheme(projectId, draft.document.theme),
          baseVersion: draft.draftVersion,
        }

  return (
    <StudioShell
      projectName={project.name}
      initialLayout={normalizeLayout(preferences["shell.layout"])}
      userKeymap={normalizeKeymap(preferences["keyboard.keymap"])}
      platform={platform}
      page={page}
      panels={{
        pages: (
          <PagesPanel
            projectId={projectId}
            currentPageId={current?.id ?? null}
            pages={pages.map((item) => ({
              id: item.id,
              title: item.title,
              slug: item.slug,
              status: item.status,
              updatedAt: item.updatedAt.toISOString(),
            }))}
          />
        ),
      }}
    />
  )
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const session = await requireSession(`/projects/${projectId}`)
  const project = await projectRepository.findById({ userId: session.userId }, projectId)

  return { title: project?.name ?? "Project" }
}
