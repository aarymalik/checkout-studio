/**
 * The utility components, as a plugin.
 *
 * The third core plugin. Where `core-layout` arranges boxes and `core-content`
 * fills them, this one holds what a merchant brings from outside the builder —
 * their own markup, and the things that are not ours to draw.
 *
 * Three entry points, per plugins/README.md: the manifest, the renderer half,
 * and the editor half. The editor half carries the HTML parser as well as the
 * property definitions, so a published checkout downloads neither.
 */

export { manifest } from "./manifest"
