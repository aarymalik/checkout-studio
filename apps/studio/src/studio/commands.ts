import type { Command, CommandDescriptor } from "@checkout-studio/editor"

/**
 * The commands the application contributes, beyond the frame's own.
 *
 * Opening the palette is a command like any other: it appears in the palette it
 * opens, it has a binding, and a menu item can run it. Treating it as a special
 * case is how a product ends up with two ways of doing one thing.
 */

export const appCommandDescriptors: readonly CommandDescriptor[] = [
  {
    id: "help.command-palette",
    title: "Open command palette",
    category: "help",
    keywords: ["search", "run", "find", "everything"],
  },
  {
    id: "help.shortcuts",
    title: "Keyboard shortcuts",
    category: "help",
    keywords: ["keys", "bindings", "reference", "cheatsheet"],
  },
  /*
   * Region cycling, for people who navigate by landmark rather than by Tab
   * count. F6 is the platform convention on Windows and in every browser's own
   * chrome, and there is nothing else it could mean here.
   */
  {
    id: "navigation.next-region",
    title: "Focus next region",
    category: "navigation",
    keywords: ["panel", "landmark", "move", "f6"],
  },
  {
    id: "navigation.previous-region",
    title: "Focus previous region",
    category: "navigation",
    keywords: ["panel", "landmark", "move", "f6"],
  },
]

export interface AppCommandActions {
  openPalette: () => void
  openShortcuts: () => void
  moveFocus: (direction: 1 | -1) => void
}

export function createAppCommands(actions: AppCommandActions): readonly Command[] {
  const behaviour: Record<string, () => void> = {
    "help.command-palette": () => actions.openPalette(),
    "help.shortcuts": () => actions.openShortcuts(),
    "navigation.next-region": () => actions.moveFocus(1),
    "navigation.previous-region": () => actions.moveFocus(-1),
  }

  return appCommandDescriptors.map((descriptor) => ({
    ...descriptor,
    isAvailable: () => true,
    run: () => {
      behaviour[descriptor.id]?.()
    },
    mutates: false,
  }))
}
