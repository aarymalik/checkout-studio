import type { Point, Rect, Size, Transform } from "./transform"
import { ZOOM_DEFAULT, centreOf, clampZoom, toCanvas } from "./transform"

/**
 * Navigating the canvas.
 *
 * Every function here is pure: a transform in, a transform out. The gesture
 * handling that calls them lives in the hooks, and the state lives in the
 * store — so the arithmetic that decides where the page ends up can be tested
 * without a pointer, a frame, or a DOM.
 *
 * See docs/editor-behavior.md § Canvas Zoom and § Canvas Pan.
 */

/**
 * The zoom levels the controls step through.
 *
 * Stepped rather than multiplied. A fixed ratio per press lands on 113% and
 * 127%, and a user who wants 100% back has to hunt for it; every design tool
 * worth copying steps through named stops instead.
 */
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

/** Room left around the page when fitting it, in screen pixels. */
export const FIT_PADDING = 48

export function panBy(transform: Transform, delta: Point): Transform {
  return {
    zoom: transform.zoom,
    pan: { x: transform.pan.x + delta.x, y: transform.pan.y + delta.y },
  }
}

/**
 * Zooms while keeping one screen point over the same canvas point.
 *
 * This is what makes wheel and pinch zoom feel like the page is under your
 * fingers rather than being rescaled around some other origin. The canvas point
 * is read *before* the zoom changes and pinned *after*, which is the whole
 * trick.
 */
export function zoomAt(transform: Transform, zoom: number, focus: Point): Transform {
  const next = clampZoom(zoom)
  const anchor = toCanvas(focus, transform)

  return {
    zoom: next,
    pan: { x: focus.x - anchor.x * next, y: focus.y - anchor.y * next },
  }
}

export function zoomBy(transform: Transform, factor: number, focus: Point): Transform {
  return zoomAt(transform, transform.zoom * factor, focus)
}

/** The next stop in `direction`, or the current zoom if there is none. */
export function steppedZoom(zoom: number, direction: 1 | -1): number {
  const stops = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse()
  const beyond = stops.find((stop) => (direction === 1 ? stop > zoom + 0.001 : stop < zoom - 0.001))

  return beyond ?? clampZoom(zoom)
}

export function stepZoom(transform: Transform, direction: 1 | -1, focus: Point): Transform {
  return zoomAt(transform, steppedZoom(transform.zoom, direction), focus)
}

/**
 * The transform that centres `content` in `viewport` at `zoom`.
 *
 * Centring is the one behaviour shared by fit, reset and zoom-to-selection, so
 * it is written once. A viewport with no area yet — the first render, before
 * layout — centres on nothing and would otherwise produce NaN.
 */
function centred(content: Rect, viewport: Size, zoom: number): Transform {
  const middle = centreOf(content)

  return {
    zoom,
    pan: {
      x: viewport.width / 2 - middle.x * zoom,
      y: viewport.height / 2 - middle.y * zoom,
    },
  }
}

/**
 * Fits the whole page in view.
 *
 * Never zooms past 100%: a short page would otherwise be blown up to fill the
 * window, which is not what "fit" means to anybody and makes a one-section page
 * look like a mistake.
 */
export function zoomToFit(content: Rect, viewport: Size, padding: number = FIT_PADDING): Transform {
  const available = {
    width: Math.max(1, viewport.width - padding * 2),
    height: Math.max(1, viewport.height - padding * 2),
  }

  if (content.width <= 0 || content.height <= 0) {
    return centred(content, viewport, ZOOM_DEFAULT)
  }

  const zoom = clampZoom(
    Math.min(ZOOM_DEFAULT, available.width / content.width, available.height / content.height),
  )

  return centred(content, viewport, zoom)
}

/**
 * Fills the view with one rect — a selection, usually.
 *
 * Unlike fit, this *does* zoom in: the point of zooming to a selection is to
 * see it closely, so a small button fills the screen.
 */
export function zoomToRect(rect: Rect, viewport: Size, padding: number = FIT_PADDING): Transform {
  const available = {
    width: Math.max(1, viewport.width - padding * 2),
    height: Math.max(1, viewport.height - padding * 2),
  }

  if (rect.width <= 0 || rect.height <= 0) {
    return centred(rect, viewport, ZOOM_DEFAULT)
  }

  const zoom = clampZoom(Math.min(available.width / rect.width, available.height / rect.height))

  return centred(rect, viewport, zoom)
}

/** Back to 100%, with the page centred. */
export function resetViewport(content: Rect, viewport: Size): Transform {
  return centred(content, viewport, ZOOM_DEFAULT)
}

/**
 * Whether a wheel event is a zoom rather than a scroll.
 *
 * A trackpad pinch arrives as a wheel event with `ctrlKey` set — which the
 * browser synthesises, and which no actual Ctrl key was involved in. Holding
 * the platform's modifier is the other way in.
 */
export function isZoomGesture(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey
}

/**
 * A wheel delta as a zoom factor.
 *
 * Exponential, so the same wheel movement changes the zoom by the same
 * proportion wherever it starts — a linear delta crawls at 400% and leaps at
 * 10%. The divisor is tuned so one notch of a mouse wheel is a small step and a
 * trackpad pinch feels continuous.
 */
export function zoomFactorFor(deltaY: number): number {
  return Math.exp(-deltaY / 300)
}
