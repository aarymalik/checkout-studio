import { BREAKPOINTS, type Breakpoint } from "@checkout-studio/schema"

import type { Command, CommandDescriptor } from "../commands/types"
import type { EditorStoreApi } from "../state/store"
import { steppedZoom } from "./viewport"

/**
 * The viewport's commands.
 *
 * Zoom and which device the page is being edited at. Commands rather than
 * buttons, because every one of them has to be reachable four ways — a
 * shortcut, the palette, a toolbar control and a menu — and a feature that
 * exists in only one of those is a feature somebody cannot find.
 *
 * Described first and built second, so a screen that lists shortcuts can read
 * the titles without being handed anything it could run.
 *
 * They need a store, and the registry is built once for the application —
 * before any page is open, and still there after one closes. So the store
 * arrives as a getter that may answer null, and a command with nothing to act
 * on reports itself unavailable rather than throwing when somebody presses its
 * key.
 *
 * See docs/keyboard-shortcuts.md § Canvas & Viewport.
 */

const DEVICE_TITLES: Record<Breakpoint, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
}

export const viewportCommandDescriptors: readonly CommandDescriptor[] = [
  {
    id: "view.zoom-in",
    title: "Zoom in",
    category: "view",
    keywords: ["magnify", "closer", "bigger", "scale"],
  },
  {
    id: "view.zoom-out",
    title: "Zoom out",
    category: "view",
    keywords: ["shrink", "further", "smaller", "scale"],
  },
  {
    id: "view.zoom-reset",
    title: "Zoom to 100%",
    category: "view",
    keywords: ["actual", "reset", "hundred", "scale"],
  },
  ...BREAKPOINTS.map((breakpoint) => ({
    id: `view.device.${breakpoint}`,
    title: `Edit at ${DEVICE_TITLES[breakpoint].toLowerCase()}`,
    category: "view" as const,
    keywords: ["device", "breakpoint", "responsive", DEVICE_TITLES[breakpoint].toLowerCase()],
  })),
]

export interface ViewportCommandOptions {
  /** Null before a page is open, and after one closes. */
  store: () => EditorStoreApi | null
}

export function createViewportCommands(options: ViewportCommandOptions): readonly Command[] {
  const { store } = options

  /*
   * Zoom about the canvas origin rather than its centre.
   *
   * Anchoring on the centre is what the wheel gesture does, and it needs the
   * size of the surface — which only a mounted canvas knows. Writing the zoom
   * alone is correct and visible; what it is not is centred. The anchored form
   * arrives with the measurement, alongside zoom-to-fit and zoom-to-selection,
   * which cannot be written at all without it.
   */
  function zoom(direction: 1 | -1): void {
    const api = store()

    if (api === null) return

    api.getState().setZoom(steppedZoom(api.getState().viewport.zoom, direction))
  }

  const behaviour: Record<string, () => void> = {
    "view.zoom-in": () => zoom(1),
    "view.zoom-out": () => zoom(-1),
    "view.zoom-reset": () => store()?.getState().setZoom(1),
  }

  for (const breakpoint of BREAKPOINTS) {
    behaviour[`view.device.${breakpoint}`] = () => store()?.getState().setBreakpoint(breakpoint)
  }

  return viewportCommandDescriptors.map((descriptor) => ({
    ...descriptor,
    // Nothing to zoom and no breakpoint to switch without a document. Shown
    // greyed rather than hidden, so the interface does not rearrange itself as
    // pages open and close.
    isAvailable: () => store() !== null,
    isActive: () => {
      const api = store()

      if (api === null) return false

      const breakpoint = descriptor.id.slice("view.device.".length)

      return (
        descriptor.id.startsWith("view.device.") &&
        api.getState().viewport.breakpoint === breakpoint
      )
    },
    run: () => {
      behaviour[descriptor.id]?.()
    },
    // The viewport is not the page. Zooming is not an edit, it produces no
    // history entry, and it must never make the document dirty.
    mutates: false,
  }))
}
