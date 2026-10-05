/**
 * The canvas.
 *
 * Geometry and navigation, with no React and no DOM: coordinate transforms,
 * viewport operations, hit testing, snapping and auto-scroll are all pure
 * functions over rectangles. The components that call them live in the
 * application, and the state they move lives in the store.
 *
 * That split is what lets the arithmetic be tested without a browser — and the
 * arithmetic is where a canvas actually goes wrong.
 *
 * See docs/editor-behavior.md § Canvas.
 */

export {
  IDENTITY,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  boundsOf,
  centreOf,
  clampZoom,
  contains,
  containsPoint,
  intersects,
  overlaps,
  rectBetween,
  rectToCanvas,
  rectToScreen,
  toCanvas,
  toScreen,
} from "./transform"
export type { Point, Rect, Size, Transform } from "./transform"

export {
  FIT_PADDING,
  ZOOM_STEPS,
  isZoomGesture,
  panBy,
  resetViewport,
  stepZoom,
  steppedZoom,
  zoomAt,
  zoomBy,
  zoomFactorFor,
  zoomToFit,
  zoomToRect,
} from "./viewport"

export { FRAME_LABEL, FRAME_WIDTH, adjacentFrame, frameRect } from "./frames"

export { nodeAt, nodesIn, selectionFor } from "./hit"
export type { NodeRects } from "./hit"

export { GRID_SIZE, SNAP_THRESHOLD, snap, snapToGrid } from "./snap"
export type { Guide, GuideAxis, SnapOptions, SnapResult } from "./snap"

export { EDGE_ZONE, MAX_SPEED, autoScrollVelocity, isNearEdge, stepFor } from "./autoscroll"
export type { AutoScrollOptions } from "./autoscroll"

export {
  classIndex,
  elementFor,
  measureContentHeight,
  measureNode,
  measureNodes,
  nodeIdAt,
} from "./measure"

export {
  useAutoScroll,
  useContentHeight,
  useNodeRects,
  useNodeResolver,
  usePanZoom,
  useViewport,
} from "./hooks"
export type { AutoScrollControls, PanZoomOptions, ViewportControls } from "./hooks"

export { createViewportCommands, viewportCommandDescriptors } from "./commands"
export type { ViewportCommandOptions } from "./commands"
