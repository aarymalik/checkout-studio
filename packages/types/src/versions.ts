/**
 * The versions that travel with a document.
 *
 * Recorded on every revision, so a stored page can be told which renderer
 * produced it. docs/compatibility.md is the policy they serve: the renderer
 * supports every schema MAJOR ever published, and a template or bundle declares
 * the renderer range it needs.
 *
 * Here rather than read from package.json: every package in this repository is
 * version 0.0.0 and private, because none of them is published separately. This
 * is the number the compatibility table tracks, and it moves when the rendering
 * contract does rather than when the repository releases.
 *
 * In this layer rather than in the renderer so that server code can read it
 * without importing the rendering engine — whose barrel is JSX, and drags a
 * React toolchain into a typecheck that has no business with one. The renderer
 * re-exports it, so its own consumers still see it as the renderer's.
 */
export const RENDERER_VERSION = "1.0.0"
