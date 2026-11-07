import type { DragEvent } from "react"

/**
 * What a pointer-driven drag's source has to say to the browser.
 *
 * ## The bug this exists because of
 *
 * Dragging out of a panel did nothing in a real browser, and every unit test
 * passed. jsdom has no native drag-and-drop, so nothing below could happen
 * there: in Chromium, pressing a cell with a picture in it and moving starts
 * the browser's *own* drag — `dragstart` fires, then `pointercancel`, and
 * every pointer-move after that goes to the drag-and-drop machinery instead
 * of to us. The gesture simply stopped two pixels in.
 *
 * An image is draggable by default and so is a link, which is why the media
 * library hit it first; a row of text can start one through a selection drag.
 * Both are the same answer: tell the browser this element is not one of
 * those.
 *
 * ## Why not `preventDefault` on the pointer down
 *
 * It would also work, and it would take focus with it — a button that cannot
 * be focused by pressing it is a button a keyboard reader loses their place
 * in. This refuses the one default that is in the way and leaves the rest.
 */
export const dragSource = {
  draggable: false,
  onDragStart: (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
  },
} as const
