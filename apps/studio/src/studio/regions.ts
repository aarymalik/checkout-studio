/**
 * The shell's focusable regions, in tab order.
 *
 * Toolbar → left sidebar → canvas → inspector → status bar, which is the order
 * docs/ui-guidelines.md specifies and the order the interface reads in. Each is
 * a landmark with a name, so a screen reader user can jump to "Layers" instead
 * of walking the document.
 */
export const REGIONS = [
  { id: "shell-toolbar", label: "Toolbar" },
  { id: "shell-sidebar", label: "Sidebar" },
  { id: "shell-canvas", label: "Canvas" },
  { id: "shell-inspector", label: "Inspector" },
  { id: "shell-status", label: "Status bar" },
] as const

export type RegionId = (typeof REGIONS)[number]["id"]

/**
 * The region after this one, wrapping.
 *
 * Skips regions that are not in the document, which is how a collapsed
 * inspector stays out of the cycle rather than sending focus nowhere.
 */
export function nextRegion(
  current: Element | null,
  direction: 1 | -1,
  root: Document | HTMLElement,
): HTMLElement | null {
  const present = REGIONS.map((region) => root.querySelector<HTMLElement>(`#${region.id}`)).filter(
    (element): element is HTMLElement => element !== null,
  )

  if (present.length === 0) return null

  const containing = present.findIndex((element) => element.contains(current))
  // Focus outside every region — the address bar, say — enters at the first one
  // going forward and the last one going back.
  const from = containing === -1 ? (direction === 1 ? -1 : 0) : containing
  const next = (from + direction + present.length) % present.length

  return present[next] ?? null
}
