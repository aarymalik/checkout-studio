/**
 * Layout components, as a plugin.
 *
 * The engine ships no components. This is the first plugin that proves that is
 * true rather than aspirational: the editor and the renderer both receive these
 * through `@checkout-studio/plugin-sdk`, and neither imports a single one of
 * them by name.
 *
 * Three entry points, per plugins/README.md:
 *
 * ```
 * .            the manifest, which both halves and the host share
 * ./renderer   component definitions and their renderers
 * ./editor     property definitions, which only the inspector reads
 * ```
 *
 * The split is what keeps the published checkout from downloading an
 * inspector's worth of property metadata. See docs/phases.md Phase 9 step 5.
 */

export { manifest } from "./manifest"
