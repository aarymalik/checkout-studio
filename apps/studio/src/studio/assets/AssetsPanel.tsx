"use client"

import type { LibraryAsset } from "@checkout-studio/api"
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  cn,
} from "@checkout-studio/ui"
import { scrollToRow, useEditorStore, useEditorStoreApi } from "@checkout-studio/editor"
import { Check, Copy, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

// Aliased: this file already has a `send`, which is the one that sends files.
import { send as request, upload } from "@/lib/api-client"
import { registry } from "@/studio/registry"

import { CELL_GAP, cellAt, gridMetrics, gridWindow, neighbour } from "./grid"
import { insertionForAsset } from "./insert"
import { LibraryControls } from "./LibraryControls"
import { EVERYTHING, kindCounts, selectAssets, type Selection } from "./select"
import { UploadZone } from "./UploadZone"

/**
 * The media library.
 *
 * ## A grid, virtualized, because a thousand assets is the target
 *
 * docs/phases.md holds the library to a thousand assets, and a thousand
 * thumbnails in the DOM is a thousand image requests and a frame budget the
 * panel does not have. Only the rows in view are rendered; the rest is spacer
 * height, so the scrollbar still tells the truth. `grid.ts` has the
 * arithmetic, and it is the layers panel's windowing with the cells divided
 * into rows first.
 *
 * ## Narrowing happens here, not on the server
 *
 * The list is already in the browser, so searching it is a filter rather than
 * a round trip. `select.ts` has that, and is separate for the reason `grid.ts`
 * is: what matters about a library of a thousand things is what happens at a
 * thousand, and that cannot be checked by rendering.
 *
 * ## The list is the server's
 *
 * As the Pages panel's is, and for its reason: two copies of a list disagree
 * the moment one of them fails to update. Uploading refreshes through the
 * router rather than pushing a row into local state.
 *
 * The same list the inspector's picker offers, because the page builds it
 * once and hands it to both — a panel showing an asset a picker cannot offer
 * is a bug nobody would think to look for. The picker reads a thinner shape
 * through the editor's own context, since that package may not import this
 * one's; what it cannot read is the sorting and filtering this panel does,
 * which is a library's business rather than an editor's.
 *
 * ## One upload affordance, not two
 *
 * `UploadZone` is a real file input with a drop zone labelling it, so dropping
 * works and so do Tab and Enter. A second drop target over the grid would be a
 * second thing to get right for a reader who cannot drag at all.
 *
 * See docs/ui-guidelines.md § Left Sidebar and docs/phases.md Phase 14.
 */

export interface AssetsPanelProps {
  projectId: string
  assets: readonly LibraryAsset[]
}

/** What the boundary accepts, as an `accept` attribute for the file chooser. */
const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "font/woff2",
  "font/woff",
  "application/pdf",
].join(",")

export function AssetsPanel({ projectId, assets }: AssetsPanelProps) {
  const router = useRouter()
  const store = useEditorStoreApi()
  // A reader who may not write may not drag one onto the page either. The
  // rest of the panel still works: looking and copying a URL are not edits.
  const canEdit = useEditorStore((state) => state.persistence.canEdit)
  const [selection, setSelection] = useState<Selection>(EVERYTHING)
  const viewport = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = useState(0)
  const [focused, setFocused] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [sending, setSending] = useState<Sending | null>(null)
  const [problems, setProblems] = useState<readonly string[]>([])
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState<LibraryAsset | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const frame = useRef<number | null>(null)

  /*
   * The pending focus frame is cancelled when the panel goes away.
   *
   * Without this a frame scheduled by the last arrow key outlives the
   * component and focuses whatever is at that position in whatever replaced
   * it — which is a panel switch pulling focus back out of wherever the reader
   * just went.
   */
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  /*
   * Measured rather than guessed. The panel is a width the reader is dragging,
   * so the number of columns is not a breakpoint — and the viewport's height
   * is what decides how many rows are rendered.
   *
   * Nothing is drawn until it has been measured. A first render at zero width
   * is a one-column grid, and the measurement a frame later rearranges it into
   * three — which is a layout jump on every mount, and the rows it rebuilds
   * are rows a reader may already have put focus in.
   */
  useEffect(() => {
    const element = viewport.current

    if (element === null) return

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect

      if (box !== undefined) setSize({ width: box.width, height: box.height })
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const shown = useMemo(() => selectAssets(assets, selection), [assets, selection])
  const counts = useMemo(() => kindCounts(assets), [assets])
  const metrics = useMemo(() => gridMetrics(shown.length, size.width), [shown.length, size.width])
  const view = gridWindow(metrics, scrollTop, size.height)

  /*
   * Focus follows the list when it shrinks. Uploading does not shorten it, but
   * deleting will, and a focus index past the end would put the roving tabindex
   * on nothing and lose the keyboard.
   */
  useEffect(() => {
    setFocused((at) => Math.min(at, Math.max(0, shown.length - 1)))
  }, [shown.length])

  const move = useCallback(
    (to: number) => {
      setFocused(to)

      const element = viewport.current

      if (element === null) return

      const { row } = cellAt(metrics, to)
      const target = scrollToRow(row, element.scrollTop, element.clientHeight, {
        rowHeight: metrics.rowHeight,
      })

      if (target !== null) element.scrollTop = target

      /*
       * After the scroll, so the cell being focused is one that exists in the
       * DOM by the time focus is asked for: setting `scrollTop` does not
       * re-render, and the row it scrolled to may not be rendered yet.
       *
       * One frame at a time. A held arrow key would otherwise schedule a queue
       * of them, and the last to run would win rather than the last pressed.
       */
      if (frame.current !== null) cancelAnimationFrame(frame.current)

      frame.current = requestAnimationFrame(() => {
        frame.current = null
        element.querySelector<HTMLButtonElement>(`[data-cell="${to}"]`)?.focus()
      })
    },
    [metrics],
  )

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const to = neighbour(metrics, shown.length, focused, event.key)

    if (to === null || to === focused) return

    event.preventDefault()
    move(to)
  }

  async function send(files: readonly File[]): Promise<void> {
    setProblems([])

    const failures: string[] = []

    /*
     * One after another. Each upload is seconds of encoding on the server, and
     * twenty at once from one merchant is a way to find out how many cores the
     * box has. It also makes "3 of 20" a true statement.
     */
    for (const [index, file] of files.entries()) {
      const at = { done: index, total: files.length, file: file.name }

      setSending({ ...at, sent: 0 })

      // Awaited in the loop on purpose. See the note above.
      const result = await upload(`/api/projects/${projectId}/assets`, file, {
        /*
         * The bytes, and only the bytes. Reaching 1 means the file has
         * arrived, not that it is stored: the server then re-encodes it into
         * four sizes and two formats, which is the longer half. So the last
         * thing progress does is hand over to a state with no number in it.
         */
        onProgress: (fraction) => {
          setSending({ ...at, sent: fraction < 1 ? fraction : null })
        },
      })

      if (!result.ok) failures.push(`${file.name} — ${result.message}`)
    }

    setSending(null)
    setProblems(failures)

    // Whatever happened to the rest, anything that landed is now in the list.
    if (failures.length < files.length) router.refresh()
  }

  /*
   * Looked up in the whole library rather than in what is shown, so narrowing
   * the list does not drop the details of the asset somebody is reading.
   */
  const chosen = assets.find((asset) => asset.id === selected) ?? null

  /**
   * Takes the chosen asset out of the library.
   *
   * The refusal stays in the dialog rather than going to the panel's own
   * problem strip, because the dialog is still open over it — and because
   * "still used on Checkout" is an answer to the question being asked right
   * there, not a report about the library.
   */
  async function remove(): Promise<void> {
    if (deleting === null) return

    setRemoving(true)
    setRefusal(null)

    const result = await request(`/api/projects/${projectId}/assets/${deleting.id}`, "DELETE")

    setRemoving(false)

    if (!result.ok) {
      setRefusal(result.message)

      return
    }

    setDeleting(null)
    // The details strip is about an asset that no longer exists.
    setSelected(null)
    router.refresh()
  }

  async function copyUrl(): Promise<void> {
    if (chosen === null) return

    await navigator.clipboard.writeText(chosen.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_600)
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <UploadZone
        accept={ACCEPT}
        busy={sending === null ? null : { label: labelFor(sending), sent: sending.sent }}
        onFiles={(files) => void send(files)}
      />

      {problems.length > 0 && (
        <Alert variant="danger" title="Some files were not stored">
          <ul className="flex flex-col gap-1">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      )}

      {assets.length > 0 && (
        <LibraryControls
          selection={selection}
          counts={counts}
          total={assets.length}
          onChange={setSelection}
        />
      )}

      {assets.length === 0 ? (
        <EmptyState
          title="No assets yet"
          description="Upload an image, a logo or a font and it will appear here."
        />
      ) : size.width === 0 ? (
        /*
         * Measured on the next frame, so this is one paint at most. It holds
         * the scroll container open so the observer has something to measure —
         * an element with no box is never reported.
         */
        <div ref={viewport} className="min-h-0 flex-1" />
      ) : shown.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="No asset in this project matches what you are looking for."
        />
      ) : (
        <div
          ref={viewport}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onKeyDown={onKeyDown}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div
            role="grid"
            aria-label="Assets"
            aria-rowcount={metrics.rows}
            aria-colcount={metrics.columns}
            style={{ height: view.total }}
            className="relative"
          >
            <div style={{ height: view.above }} />

            {Array.from({ length: view.end - view.start }, (_, offset) => {
              const row = view.start + offset

              return (
                <div
                  key={row}
                  role="row"
                  aria-rowindex={row + 1}
                  style={{ height: metrics.rowHeight, gap: CELL_GAP }}
                  className="flex"
                >
                  {shown
                    .slice(row * metrics.columns, row * metrics.columns + metrics.columns)
                    .map((asset, column) => {
                      const index = row * metrics.columns + column

                      return (
                        <Cell
                          key={asset.id}
                          asset={asset}
                          index={index}
                          column={column}
                          width={metrics.cellWidth}
                          focused={index === focused}
                          selected={asset.id === selected}
                          onChoose={() => {
                            setFocused(index)
                            setSelected(asset.id)
                          }}
                          onDrag={() => {
                            if (!canEdit) return

                            const insertion = insertionForAsset(registry, asset)

                            if (insertion !== null) store.getState().setInserting(insertion)
                          }}
                        />
                      )
                    })}
                </div>
              )
            })}

            <div style={{ height: view.below }} />
          </div>
        </div>
      )}

      {chosen !== null && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="truncate text-sm text-foreground" title={chosen.fileName}>
            {chosen.fileName}
          </p>
          <p className="text-xs text-foreground-muted">{describe(chosen)}</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => void copyUrl()}>
              {copied ? (
                <Check aria-hidden="true" className="size-3" />
              ) : (
                <Copy aria-hidden="true" className="size-3" />
              )}
              {copied ? "Copied" : "Copy URL"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRefusal(null)
                setDeleting(chosen)
              }}
            >
              <Trash2 aria-hidden="true" className="size-3" />
              Delete
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
      >
        <DialogContent
          title={`Delete ${deleting?.fileName ?? "asset"}?`}
          /*
           * The second sentence is the refusal said in advance. Somebody who
           * knows a picture in use cannot be deleted goes and takes it off the
           * page; somebody who finds out by being refused goes looking for a
           * bug.
           */
          description="It stops being listed straight away. An asset a page still uses cannot be deleted."
          // A misplaced click should not be able to take somebody's picture.
          dismissOnClickOutside={false}
        >
          {refusal !== null && (
            <Alert variant="danger" title="Still in use">
              {refusal}
            </Alert>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={removing} onClick={() => void remove()}>
              Delete asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * One cell.
 *
 * A `gridcell` holding a button, rather than a button with a grid role on it: a
 * cell is a position and the button is the thing you press, and collapsing the
 * two leaves a screen reader announcing a position it cannot act on.
 *
 * One tab stop for the whole grid, which is what a grid is — Tab moves past it,
 * the arrows move within it.
 */
function Cell({
  asset,
  index,
  column,
  width,
  focused,
  selected,
  onChoose,
  onDrag,
}: {
  asset: LibraryAsset
  index: number
  column: number
  width: number
  focused: boolean
  selected: boolean
  onChoose: () => void
  /**
   * Starts a drag onto the canvas.
   *
   * On the press rather than on a movement threshold, which is what the
   * component library does and for the same reason: the canvas resolves the
   * drag and ends it on pointer-up, so a press that never moves ends with
   * nothing inserted. Pressing still selects — the click handler above is
   * untouched by this.
   */
  onDrag: () => void
}) {
  return (
    <div role="gridcell" aria-colindex={column + 1} aria-selected={selected}>
      <button
        type="button"
        data-cell={index}
        tabIndex={focused ? 0 : -1}
        onClick={onChoose}
        onPointerDown={onDrag}
        style={{ width }}
        className={cn(
          "flex flex-col gap-1 rounded-control p-1 text-left",
          "transition-colors duration-fast ease-standard",
          "hover:bg-surface-hover",
          "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
          selected && "bg-primary-subtle",
        )}
      >
        <span
          style={{ height: width - 8 }}
          className="flex items-center justify-center overflow-hidden rounded-tight bg-surface-sunken"
        >
          {asset.mimeType.startsWith("image/") ? (
            <img
              src={asset.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span aria-hidden="true" className="text-xs text-foreground-muted">
              {extensionOf(asset)}
            </span>
          )}
        </span>

        <span className="truncate text-xs text-foreground-muted">{asset.fileName}</span>
      </button>
    </div>
  )
}

/** Which file is going up, how far, and how many there are. */
interface Sending {
  /** How many are finished. The one in flight is this one plus one. */
  done: number
  total: number
  file: string
  /** 0 to 1 while the bytes go up, null while the server works on them. */
  sent: number | null
}

/**
 * What to say about the upload in progress.
 *
 * The count only when there is more than one, because "1 of 1" is a sentence
 * that answers a question nobody asked. The file name always, because with
 * twenty going up it is the only way to tell which one a refusal was about.
 */
function labelFor(sending: Sending): string {
  const which =
    sending.total > 1 ? `${String(sending.done + 1)} of ${String(sending.total)} · ` : ""

  return sending.sent === null ? `${which}Storing ${sending.file}…` : `${which}${sending.file}`
}

/** The type and the shape, for the one asset somebody is looking at. */
function describe(asset: LibraryAsset): string {
  const shape =
    asset.width === null || asset.height === null ? null : `${asset.width}×${asset.height}`

  return [shape, formatSize(asset.sizeBytes), asset.mimeType].filter(Boolean).join(" · ")
}

function formatSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`

  return `${Math.round(bytes / 100_000) / 10} MB`
}

/** For a file with no picture to show: what it is, in four letters or fewer. */
function extensionOf(asset: LibraryAsset): string {
  const subtype = asset.mimeType.split("/")[1] ?? "file"

  return subtype.replace(/^x-/, "").slice(0, 4).toUpperCase()
}
