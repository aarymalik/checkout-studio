import type { Command, CommandDescriptor } from "../commands/types"
import { SIDEBAR_TABS, type SidebarTabId } from "./layout"
import type { ShellActions } from "./store"

/**
 * The frame's commands.
 *
 * Described first and built second, so a screen that lists shortcuts can read
 * the titles without being handed anything it could run.
 *
 * Panel commands are always available: there is always a panel to toggle, with
 * or without a selection.
 */

const TAB_TITLES: Record<SidebarTabId, string> = {
  components: "Components",
  layers: "Layers",
  pages: "Pages",
  assets: "Assets",
  templates: "Templates",
  theme: "Theme",
}

export const shellCommandDescriptors: readonly CommandDescriptor[] = [
  {
    id: "view.toggle-left-panel",
    title: "Toggle left sidebar",
    category: "view",
    keywords: ["panel", "hide", "show", "components", "layers"],
  },
  {
    id: "view.toggle-right-panel",
    title: "Toggle inspector",
    category: "view",
    keywords: ["panel", "hide", "show", "properties"],
  },
  {
    id: "view.toggle-panels",
    title: "Toggle all panels",
    category: "view",
    keywords: ["focus", "zen", "distraction", "hide"],
  },
  {
    id: "view.reset-layout",
    title: "Reset panel layout",
    category: "view",
    keywords: ["default", "restore", "panels"],
  },
  ...SIDEBAR_TABS.map((tab) => ({
    id: `view.sidebar.${tab}`,
    title: `Show ${TAB_TITLES[tab]}`,
    category: "view" as const,
    keywords: ["panel", "sidebar", TAB_TITLES[tab].toLowerCase()],
  })),
]

/** What each descriptor does, given something to do it to. */
export function createShellCommands(actions: ShellActions): readonly Command[] {
  const behaviour: Record<string, () => void> = {
    "view.toggle-left-panel": () => actions.toggleLeft(),
    "view.toggle-right-panel": () => actions.toggleRight(),
    "view.toggle-panels": () => actions.toggleBoth(),
    "view.reset-layout": () => actions.reset(),
  }

  for (const tab of SIDEBAR_TABS) {
    behaviour[`view.sidebar.${tab}`] = () => actions.selectTab(tab)
  }

  return shellCommandDescriptors.map((descriptor) => ({
    ...descriptor,
    isAvailable: () => true,
    run: () => {
      behaviour[descriptor.id]?.()
    },
    mutates: false,
  }))
}
