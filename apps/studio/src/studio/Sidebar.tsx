"use client"

import {
  Blocks,
  ChevronsRight,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Layers,
  Palette,
} from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import { EmptyState, Panel, Splitter, Tooltip, cn } from "@checkout-studio/ui"
import { LAYOUT } from "@checkout-studio/design-system"
import {
  SIDEBAR_TABS,
  useKeyboard,
  useShellActions,
  useShellLayout,
  type SidebarTabId,
} from "@checkout-studio/editor"

/**
 * The left sidebar.
 *
 * A shell: the six tabs exist, each is reachable by keyboard and by pointer, and
 * each says what will be there. The contents arrive with the features they
 * belong to, because a panel full of placeholder rows teaches people that the
 * product is unfinished rather than that a feature is coming.
 *
 * Collapsed, it becomes a rail of icons rather than nothing, so collapsing is
 * never a trap: the tabs stay reachable, and choosing one opens the panel.
 *
 * See docs/ui-guidelines.md § Left Sidebar.
 */

const TABS: Record<
  SidebarTabId,
  {
    label: string
    icon: ComponentType<{ className?: string }>
    waitingFor: string
    /** The panel scrolls itself, because it virtualizes. See Panel's `scroll`. */
    ownScroll?: boolean
  }
> = {
  components: {
    label: "Components",
    icon: Blocks,
    waitingFor: "The component library arrives with the block system.",
  },
  layers: {
    label: "Layers",
    icon: Layers,
    waitingFor: "The layer tree arrives with the editor state engine.",
    ownScroll: true,
  },
  pages: {
    label: "Pages",
    icon: FileText,
    waitingFor: "Pages arrive with the page manager.",
  },
  assets: {
    label: "Assets",
    icon: ImageIcon,
    waitingFor: "Uploads arrive with the asset pipeline.",
  },
  templates: {
    label: "Templates",
    icon: LayoutTemplate,
    waitingFor: "Templates arrive with the template gallery.",
  },
  theme: {
    label: "Theme",
    icon: Palette,
    waitingFor: "Theme editing arrives with the theme engine.",
  },
}

/**
 * What each tab shows, for the tabs that have something to show.
 *
 * A tab with no entry falls back to saying what will be there. That is the
 * whole shape of this phase of the product: the frame exists, and each panel
 * arrives with the feature it belongs to.
 */
export type SidebarPanels = Partial<Record<SidebarTabId, ReactNode>>

export function Sidebar({ panels }: { panels: SidebarPanels }) {
  const layout = useShellLayout()
  const actions = useShellActions()
  const active = TABS[layout.sidebarTab]
  const panel = panels[layout.sidebarTab]

  if (layout.leftCollapsed) {
    return (
      <nav
        id="shell-sidebar"
        tabIndex={-1}
        aria-label="Sidebar"
        className="flex w-panel-rail shrink-0 flex-col items-center gap-2 border-r border-border bg-surface p-2"
      >
        <TabList orientation="vertical" />

        <button
          type="button"
          aria-label="Expand sidebar"
          aria-expanded={false}
          onClick={() => actions.toggleLeft()}
          className={cn(
            "mt-auto inline-flex size-control-sm items-center justify-center rounded-control",
            "text-foreground-muted",
            "transition-colors duration-fast ease-standard",
            "hover:bg-surface-hover hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
          )}
        >
          <ChevronsRight aria-hidden="true" className="size-4" />
        </button>
      </nav>
    )
  }

  return (
    <div className="flex min-h-0">
      <Panel
        id="shell-sidebar"
        tabIndex={-1}
        title={active.label}
        onCollapsedChange={() => actions.toggleLeft()}
        side="start"
        actions={<TabList orientation="horizontal" />}
        // Inline width: it is a value the reader is dragging, not a design
        // decision, and there is no token for "however wide they left it".
        style={{ width: layout.leftWidth }}
        className="min-w-0"
        // A panel with no contents yet shows an empty state, which does not
        // virtualize and should scroll like every other panel.
        scroll={active.ownScroll !== true || panel === undefined}
      >
        {panel ?? <EmptyState title={active.label} description={active.waitingFor} />}
      </Panel>

      <Splitter
        label="Resize sidebar"
        value={layout.leftWidth}
        min={LAYOUT.left.min}
        max={LAYOUT.left.max}
        side="start"
        onChange={actions.resizeLeft}
      />
    </div>
  )
}

/**
 * The tabs.
 *
 * A tablist rather than a row of buttons, so the arrow keys move between them
 * and a screen reader announces which of six is showing. The same list serves
 * the panel's header and the collapsed rail — one set of tabs, two shapes.
 */
export function TabList({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const layout = useShellLayout()
  const actions = useShellActions()
  const { keymap, platform } = useKeyboard()
  const vertical = orientation === "vertical"

  function hint(tab: SidebarTabId): string {
    const binding = keymap.bindingFor(`view.sidebar.${tab}`)

    return binding === null
      ? TABS[tab].label
      : `${TABS[tab].label} · ${keymap.format(binding, platform)}`
  }

  function move(index: number, delta: number, list: HTMLElement | null): void {
    const next = (index + delta + SIDEBAR_TABS.length) % SIDEBAR_TABS.length
    const tab = SIDEBAR_TABS[next]

    if (tab === undefined) return

    actions.selectTab(tab)
    list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Sidebar sections"
      aria-orientation={orientation}
      className={cn("flex items-center gap-1", vertical && "flex-col")}
    >
      {SIDEBAR_TABS.map((tab, index) => {
        const Icon = TABS[tab].icon
        const selected = tab === layout.sidebarTab

        return (
          <Tooltip key={tab} content={hint(tab)} side={vertical ? "right" : "bottom"}>
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={TABS[tab].label}
              // One tab stop for the whole list, which is what a tablist is:
              // Tab moves past it, the arrows move within it.
              tabIndex={selected ? 0 : -1}
              onClick={() => actions.selectTab(tab)}
              onKeyDown={(event) => {
                const forward = vertical ? "ArrowDown" : "ArrowRight"
                const back = vertical ? "ArrowUp" : "ArrowLeft"

                if (event.key === forward || event.key === back) {
                  event.preventDefault()
                  move(index, event.key === forward ? 1 : -1, event.currentTarget.parentElement)
                }
              }}
              className={cn(
                "inline-flex items-center justify-center text-foreground-muted",
                vertical ? "size-control-sm rounded-control" : "size-6 rounded-tight",
                "transition-colors duration-fast ease-standard",
                "hover:bg-surface-hover hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
                selected && "bg-primary-subtle text-primary",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
