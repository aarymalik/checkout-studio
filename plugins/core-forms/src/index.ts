/**
 * The form system, as a plugin.
 *
 * The engine knows nothing about forms. It knows that a plugin may put a React
 * provider around the tree and may register components, and that is the whole
 * of what this needs — docs/renderer.md § Context Providers, where the forms
 * provider is named as the one the checkout provider depends on, because
 * checkout fields are form fields.
 */

export { manifest } from "./manifest"
