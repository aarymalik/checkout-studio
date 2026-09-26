import { ChevronsLeft, ChevronsRight } from "lucide-react"
import { useId } from "react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { ScrollArea } from "./ScrollArea"
import { cn } from "../lib/cn"

/**
 * A panel of the editor shell.
 *
 * A titled region with its own scroll, so a long list inside it does not scroll
 * the page. `role="region"` with the title as its name, which is what lets a
 * screen reader user jump straight to "Layers" instead of walking the document.
 */
export interface PanelProps extends Omit<ComponentPropsWithRef<"section">, "title"> {
  title: string
  /** Hidden visually, still announced — for a panel whose content names itself. */
  titleHidden?: boolean
  /** Controls in the header: a filter, a button, a menu. */
  actions?: ReactNode
  /** Turns the panel into a collapsed rail. */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** Which edge it sits on, which decides the direction the collapse arrow points. */
  side?: "start" | "end"
}

export function Panel({
  className,
  title,
  titleHidden = false,
  actions,
  collapsed = false,
  onCollapsedChange,
  side = "start",
  children,
  ...props
}: PanelProps) {
  const titleId = useId()
  const Collapse = side === "start" ? ChevronsLeft : ChevronsRight

  return (
    <section
      aria-labelledby={titleId}
      data-collapsed={collapsed || undefined}
      className={cn(
        "flex min-h-0 flex-col bg-surface",
        "transition-[width] duration-normal ease-standard",
        className,
      )}
      {...props}
    >
      <header className="flex h-control-lg shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2
          id={titleId}
          className={cn(
            "truncate text-caption font-medium tracking-wide text-foreground-muted uppercase",
            // Hidden visually only while collapsed, never from the name: the
            // region has to stay findable by its title even as a rail.
            (titleHidden || collapsed) && "sr-only",
          )}
        >
          {title}
        </h2>

        <div className="flex items-center gap-1">
          {collapsed ? null : actions}

          {onCollapsedChange === undefined ? null : (
            <button
              type="button"
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              aria-expanded={!collapsed}
              onClick={() => onCollapsedChange(!collapsed)}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-tight",
                "text-foreground-muted",
                "transition-colors duration-fast ease-standard outline-none",
                "hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <Collapse aria-hidden="true" className={cn("size-4", collapsed && "rotate-180")} />
            </button>
          )}
        </div>
      </header>

      {collapsed ? null : (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="p-3">
          {children}
        </ScrollArea>
      )}
    </section>
  )
}
