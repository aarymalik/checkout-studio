"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Copy, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
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
  cn,
} from "@checkout-studio/ui"

import { post, send } from "@/lib/api-client"

/**
 * The Pages panel.
 *
 * The one panel with contents in Phase 4's shell — everything else waits for
 * the feature it belongs to. Pages exist now, so this does.
 *
 * The list comes from the server and is refreshed through the router after a
 * change, rather than being mirrored into local state. Two copies of a list
 * disagree the moment one of them fails to update.
 */

export interface PageSummary {
  id: string
  title: string
  slug: string
  status: string
  updatedAt: string
}

export function PagesPanel({
  projectId,
  pages,
  currentPageId,
}: {
  projectId: string
  pages: readonly PageSummary[]
  currentPageId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<PageSummary | null>(null)
  const [deleting, setDeleting] = useState<PageSummary | null>(null)

  function refresh(): void {
    startTransition(() => {
      router.refresh()
    })
  }

  async function run(work: () => Promise<{ ok: boolean; message?: string }>): Promise<boolean> {
    setBusy(true)
    setProblem(null)

    const result = await work()

    setBusy(false)

    if (!result.ok) {
      setProblem(result.message ?? "That did not work.")

      return false
    }

    refresh()

    return true
  }

  async function create(title: string): Promise<void> {
    const result = await post<{ page: PageSummary }>(`/api/projects/${projectId}/pages`, { title })

    if (!(await run(async () => result))) return

    setCreating(false)

    if (result.ok) open(result.data.page.id)
  }

  /** Opening a page is a navigation: the document is resolved on the server. */
  function open(pageId: string): void {
    router.push(`/projects/${projectId}?page=${pageId}`)
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <Button size="sm" onClick={() => setCreating(true)} className="w-full">
        <Plus aria-hidden="true" className="size-4" />
        New page
      </Button>

      {problem === null ? null : (
        <Alert variant="danger" title="That did not work">
          {problem}
        </Alert>
      )}

      {pages.length === 0 ? (
        <EmptyState
          title="No pages yet"
          description="A page is one checkout: its layout, its theme and its settings."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-current={page.id === currentPageId ? "page" : undefined}
                onClick={() => open(page.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-2 text-left",
                  "text-body text-foreground",
                  "transition-colors duration-fast ease-standard",
                  "hover:bg-surface-hover",
                  "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
                  page.id === currentPageId && "bg-primary-subtle text-primary",
                )}
              >
                <FileText aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{page.title}</span>
                {page.status === "published" ? (
                  <span className="shrink-0 text-caption text-foreground-subtle">Live</span>
                ) : null}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label={`Actions for ${page.title}`}>
                    <MoreHorizontal aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem icon={<Pencil />} onSelect={() => setRenaming(page)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={<Copy />}
                    onSelect={() =>
                      void run(async () => {
                        const result = await post(`/api/pages/${page.id}/duplicate`, {})

                        return result
                      })
                    }
                  >
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={<Trash2 />}
                    destructive
                    onSelect={() => setDeleting(page)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <TitleDialog
        open={creating}
        onOpenChange={setCreating}
        title="New page"
        description="You can rename it later. The URL is set from this name and does not change."
        confirmLabel="Create page"
        busy={busy}
        onConfirm={(title) => void create(title)}
      />

      <TitleDialog
        open={renaming !== null}
        onOpenChange={(next) => {
          if (!next) setRenaming(null)
        }}
        title="Rename page"
        description="The URL keeps the name it was created with, so shared links keep working."
        confirmLabel="Save"
        initialTitle={renaming?.title ?? ""}
        busy={busy}
        onConfirm={(title) => {
          if (renaming === null) return

          void run(async () => send(`/api/pages/${renaming.id}`, "PATCH", { title })).then((ok) => {
            if (ok) setRenaming(null)
          })
        }}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
      >
        <DialogContent
          title={`Delete ${deleting?.title ?? "page"}?`}
          description="It stops being listed straight away. Deleted pages are recoverable."
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
                if (deleting === null) return

                void run(async () => send(`/api/pages/${deleting.id}`, "DELETE")).then((ok) => {
                  if (ok) setDeleting(null)
                })
              }}
            >
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Naming a page. One dialog for creating and renaming; they differ in words. */
function TitleDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  initialTitle = "",
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  initialTitle?: string
  busy: boolean
  onConfirm: (title: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onConfirm(String(new FormData(event.currentTarget).get("title") ?? "").trim())
          }}
        >
          <Input
            name="title"
            label="Name"
            defaultValue={initialTitle}
            maxLength={120}
            required
            autoFocus
            placeholder="Checkout"
          />

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
