"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { MoreHorizontal, Plus } from "lucide-react"
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
} from "@checkout-studio/ui"
import { post, send } from "@/lib/api-client"
import { Logo } from "@/components/brand/Logo"

/**
 * The projects somebody owns.
 *
 * Rendered from the server's list and refreshed through the router after a
 * change, so there is one source of truth rather than a local copy that can
 * disagree with the database.
 */

export interface ProjectSummary {
  id: string
  name: string
  slug: string
  description: string | null
  updatedAt: string
}

const NAME_MAXIMUM = 80

export function ProjectList({
  email,
  projects,
}: {
  email: string
  projects: readonly ProjectSummary[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null)
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null)
  const [undoable, setUndoable] = useState<ProjectSummary | null>(null)

  function refresh(): void {
    startTransition(() => {
      router.refresh()
    })
  }

  async function create(name: string, description: string): Promise<void> {
    setBusy(true)
    setProblem(null)

    const result = await post<{ project: ProjectSummary }>("/api/projects", {
      name,
      ...(description === "" ? {} : { description }),
    })

    setBusy(false)

    if (!result.ok) {
      setProblem(result.message)
      return
    }

    setCreating(false)
    // Straight into the editor: creating a project is something somebody does
    // because they want to start building, not because they want a row in a list.
    router.push(`/projects/${result.data.project.id}`)
  }

  async function rename(project: ProjectSummary, name: string): Promise<void> {
    setBusy(true)
    setProblem(null)

    const result = await send(`/api/projects/${project.id}`, "PATCH", { name })

    setBusy(false)

    if (!result.ok) {
      setProblem(result.message)
      return
    }

    setRenaming(null)
    refresh()
  }

  async function remove(project: ProjectSummary): Promise<void> {
    setBusy(true)
    setProblem(null)

    const result = await send(`/api/projects/${project.id}`, "DELETE")

    setBusy(false)
    setDeleting(null)

    if (!result.ok) {
      setProblem(result.message)
      return
    }

    // Soft deleted, and recoverable for thirty days. Offering the undo here is
    // what makes the confirmation dialog honest rather than frightening.
    setUndoable(project)
    refresh()
  }

  async function restore(project: ProjectSummary): Promise<void> {
    setBusy(true)
    const result = await post(`/api/projects/${project.id}`, {})

    setBusy(false)
    setUndoable(null)

    if (!result.ok) {
      setProblem(result.message)
      return
    }

    refresh()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center gap-3">
        <Logo className="size-6" />
        <h1 className="text-h2 font-semibold text-foreground">Projects</h1>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-caption text-foreground-muted">{email}</span>
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            New project
          </Button>
        </div>
      </header>

      {problem === null ? null : (
        <Alert variant="danger" title="That did not work">
          {problem}
        </Alert>
      )}

      {undoable === null ? null : (
        <Alert variant="info" title={`${undoable.name} was deleted`}>
          <div className="flex items-center gap-3">
            <span>You can restore it for the next thirty days.</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void restore(undoable)}
            >
              Undo
            </Button>
          </div>
        </Alert>
      )}

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="A project holds your pages, your theme and your checkout."
          action={<Button onClick={() => setCreating(true)}>Create your first project</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-busy={pending}>
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center gap-4 rounded-card border border-border bg-surface p-4"
            >
              <a
                href={`/projects/${project.id}`}
                className="flex min-w-0 flex-1 flex-col gap-1 rounded-tight outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <span className="truncate text-body font-medium text-foreground">
                  {project.name}
                </span>
                <span className="truncate text-caption text-foreground-muted">
                  {project.description ?? project.slug}
                </span>
              </a>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label={`Actions for ${project.name}`}>
                    <MoreHorizontal aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setRenaming(project)}>Rename</DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => setDeleting(project)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title="New project"
        description="You can rename it later. The URL is set from this name and does not change."
        confirmLabel="Create project"
        busy={busy}
        withDescription
        onConfirm={(name, description) => void create(name, description)}
      />

      <NameDialog
        open={renaming !== null}
        onOpenChange={(next) => {
          if (!next) setRenaming(null)
        }}
        title="Rename project"
        description="The URL keeps the name it was created with, so shared links keep working."
        confirmLabel="Save"
        initialName={renaming?.name ?? ""}
        busy={busy}
        onConfirm={(name) => {
          if (renaming !== null) void rename(renaming, name)
        }}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
      >
        <DialogContent
          title={`Delete ${deleting?.name ?? "project"}?`}
          description="It stops being listed straight away. You can restore it for thirty days."
          // A misplaced click should not be able to discard work.
          dismissOnClickOutside={false}
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (deleting !== null) void remove(deleting)
              }}
            >
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Naming something.
 *
 * One dialog for creating and renaming, because the two differ only in their
 * words. Submitting is a form, so Enter works without a keydown handler.
 */
function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  initialName = "",
  withDescription = false,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  initialName?: string
  withDescription?: boolean
  busy: boolean
  onConfirm: (name: string, description: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)

            onConfirm(String(form.get("name") ?? "").trim(), String(form.get("description") ?? ""))
          }}
        >
          <Input
            id="project-name"
            name="name"
            label="Name"
            defaultValue={initialName}
            maxLength={NAME_MAXIMUM}
            required
            autoFocus
            placeholder="Spring sale"
          />

          {withDescription ? (
            <Input
              id="project-description"
              name="description"
              label="Description"
              description="Optional. What this project is for."
              maxLength={500}
            />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
