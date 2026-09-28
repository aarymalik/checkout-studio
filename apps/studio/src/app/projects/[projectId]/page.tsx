import { notFound } from "next/navigation"
import { preferenceRepository, projectRepository } from "@checkout-studio/database"
import { normalizeKeymap, normalizeLayout } from "@checkout-studio/editor"

import { StudioShell } from "@/studio/StudioShell"
import { requestPlatform } from "@/lib/platform"
import { requireSession } from "@/lib/session"

/**
 * The editor.
 *
 * The layout is resolved here rather than in the browser, so the first paint is
 * the arrangement they left. Fetching it after hydration would show the default
 * frame and then move it, which is the layout jump docs/ui-guidelines.md
 * forbids.
 */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const session = await requireSession(`/projects/${projectId}`)
  const tenant = { userId: session.userId, projectId }

  const [project, preferences, platform] = await Promise.all([
    projectRepository.findById(tenant, projectId),
    preferenceRepository.all(tenant),
    requestPlatform(),
  ])

  // A project belonging to somebody else answers the same way as one that never
  // existed, because telling the two apart tells the caller something.
  if (project === null) notFound()

  return (
    <StudioShell
      projectName={project.name}
      initialLayout={normalizeLayout(preferences["shell.layout"])}
      userKeymap={normalizeKeymap(preferences["keyboard.keymap"])}
      platform={platform}
    />
  )
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const session = await requireSession(`/projects/${projectId}`)
  const project = await projectRepository.findById({ userId: session.userId }, projectId)

  return { title: project?.name ?? "Project" }
}
