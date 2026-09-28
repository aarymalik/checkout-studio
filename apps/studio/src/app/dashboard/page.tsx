import { projectRepository } from "@checkout-studio/database"

import { ProjectList } from "./ProjectList"
import { requireSession } from "@/lib/session"

export const metadata = { title: "Projects" }

/**
 * Where somebody lands after signing in.
 *
 * The list is rendered on the server: it is the first thing they see, and a
 * skeleton that resolves into three rows a moment later is slower than the
 * markup arriving with them.
 */
export default async function DashboardPage() {
  const session = await requireSession("/dashboard")
  const projects = await projectRepository.list({ userId: session.userId })

  return (
    <ProjectList
      email={session.email}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        updatedAt: project.updatedAt.toISOString(),
      }))}
    />
  )
}
