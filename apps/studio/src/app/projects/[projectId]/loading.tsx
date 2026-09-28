import { Skeleton } from "@checkout-studio/ui"

/**
 * While the editor's frame is being resolved.
 *
 * The frame's own shape — a toolbar, three columns, a status bar — rather than a
 * spinner in the middle of an empty page, so the interface appears to assemble
 * rather than to arrive.
 *
 * The panel widths are the defaults, not the stored ones: the stored layout is
 * exactly what this is waiting for. It is on screen for a fraction of a second,
 * and guessing would cost a visible jump when the real layout lands.
 */
export default function EditorLoading() {
  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading the editor</span>

      <div className="flex h-toolbar shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Skeleton className="size-6 rounded-control" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-control-sm w-24 rounded-control" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-panel-left shrink-0 flex-col gap-3 border-r border-border bg-surface p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>

        <div className="flex-1 bg-canvas" />

        <div className="flex w-panel-right shrink-0 flex-col gap-3 border-l border-border bg-surface p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>

      <div className="h-status-bar shrink-0 border-t border-border bg-surface" />
    </div>
  )
}
