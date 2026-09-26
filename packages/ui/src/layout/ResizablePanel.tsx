import { useState } from "react"
import type { ReactNode } from "react"
import { Panel } from "./Panel"
import { Splitter } from "./Splitter"
import { cn } from "../lib/cn"

/**
 * A panel the reader can resize, with a divider they can reach.
 *
 * Width is owned by the caller when it is given, because docs/design-system.md
 * asks for it to persist — and a component cannot persist anything the
 * application does not know about. Uncontrolled, it starts at `defaultWidth` and
 * remembers only for as long as it is mounted.
 */
export interface ResizablePanelProps {
  title: string
  titleHidden?: boolean
  actions?: ReactNode
  children: ReactNode
  /** The edge it sits on. The divider goes on the inner side. */
  side?: "start" | "end"
  width?: number
  defaultWidth?: number
  onWidthChange?: (width: number) => void
  minWidth?: number
  maxWidth?: number
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** The width of the collapsed rail. */
  collapsedWidth?: number
  className?: string
}

export function ResizablePanel({
  title,
  titleHidden,
  actions,
  children,
  side = "start",
  width,
  defaultWidth = 320,
  onWidthChange,
  minWidth = 260,
  maxWidth = 420,
  collapsed = false,
  onCollapsedChange,
  collapsedWidth = 64,
  className,
}: ResizablePanelProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultWidth)
  const current = width ?? uncontrolled

  function resize(next: number): void {
    if (width === undefined) setUncontrolled(next)
    onWidthChange?.(next)
  }

  const divider = (
    <Splitter
      label={`Resize ${title}`}
      value={current}
      min={minWidth}
      max={maxWidth}
      side={side}
      onChange={resize}
    />
  )

  return (
    <div className={cn("flex min-h-0", className)}>
      {side === "end" ? divider : null}

      <Panel
        title={title}
        {...(titleHidden === undefined ? {} : { titleHidden })}
        {...(actions === undefined ? {} : { actions })}
        collapsed={collapsed}
        {...(onCollapsedChange === undefined ? {} : { onCollapsedChange })}
        side={side}
        // Inline width: it is a value the reader is dragging, not a design
        // decision, and there is no token for "however wide they left it".
        style={{ width: collapsed ? collapsedWidth : current }}
        className="min-w-0"
      >
        {children}
      </Panel>

      {side === "start" ? divider : null}
    </div>
  )
}
