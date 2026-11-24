/**
 * The loader build the Studio offers to pin to.
 *
 * Restated here rather than imported from the renderer, because the two
 * applications are separate deployments and neither imports the other. The
 * renderer's own test is what guarantees the bytes still hash to this; what
 * would go wrong here is offering a hash for a build that application never
 * published, which is why this names the version explicitly rather than
 * tracking "whatever is newest".
 *
 * Changing the loader means publishing a new frozen build in the renderer
 * and then updating this. Until it is updated the Studio keeps offering the
 * older build, which still works — that is what freezing them is for.
 */
export const CURRENT_LOADER = {
  path: "/embed/v1.js",
  integrity: "sha384-Bhz8asdL/tIfcfhSOW9lM7jvTiTTkzSI2YeReg/Oh4mWe8JNJFmLpRq4g4YTZ0Vf",
} as const
