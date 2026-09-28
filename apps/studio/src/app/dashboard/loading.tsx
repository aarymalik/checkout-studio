import { Skeleton } from "@checkout-studio/ui"

/**
 * While the project list is being fetched.
 *
 * Rows of the shape the real ones will have, so the page does not jump when they
 * arrive. Announced as busy rather than silently blank: a screen reader user
 * should hear that something is coming.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-8" role="status" aria-busy="true">
      <span className="sr-only">Loading your projects</span>

      <div className="flex items-center gap-3">
        <Skeleton className="size-6 rounded-control" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="ml-auto h-control-md w-32 rounded-control" />
      </div>

      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="flex items-center gap-4 rounded-card border border-border bg-surface p-4"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="size-6 rounded-tight" />
          </div>
        ))}
      </div>
    </div>
  )
}
