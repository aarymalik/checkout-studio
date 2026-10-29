"use client"

import type { LibraryAsset } from "@checkout-studio/api"
import { Alert, Button, EmptyState, cn } from "@checkout-studio/ui"
import { scrollToRow } from "@checkout-studio/editor"
import { Check, Copy } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

import { upload } from "@/lib/api-client"

import { CELL_GAP, cellAt, gridMetrics, gridWindow, neighbour } from "./grid"
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
  const [selection, setSelection] = useState<Selection>(EVERYTHING)
  const viewport = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = useState(0)
  const [focused, setFocused] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null)
  const [problems, setProblems] = useState<readonly string[]>([])
  const [copied, setCopied] = useState(false)
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
    setSending({ done: 0, total: files.length })

    const failures: string[] = []

    /*
     * One after another. Each upload is seconds of encoding on the server, and
     * twenty at once from one merchant is a way to find out how many cores the
     * box has. It also makes "3 of 20" a true statement.
     */
    for (const [index, file] of files.entries()) {
      // Awaited in the loop on purpose. See the note above.
      const result = await upload(`/api/projects/${projectId}/assets`, file)

      if (!result.ok) failures.push(`${file.name} — ${result.message}`)

      setSending({ done: index + 1, total: files.length })
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
        busy={sending === null ? null : `Uploading ${sending.done} of ${sending.total}…`}
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
          <Button variant="ghost" size="sm" onClick={() => void copyUrl()}>
            {copied ? (
              <Check aria-hidden="true" className="size-3" />
            ) : (
              <Copy aria-hidden="true" className="size-3" />
            )}
            {copied ? "Copied" : "Copy URL"}
          </Button>
        </div>
      )}
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
}: {
  asset: LibraryAsset
  index: number
  column: number
  width: number
  focused: boolean
  selected: boolean
  onChoose: () => void
}) {
  return (
    <div role="gridcell" aria-colindex={column + 1} aria-selected={selected}>
      <button
        type="button"
        data-cell={index}
        tabIndex={focused ? 0 : -1}
        onClick={onChoose}
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
