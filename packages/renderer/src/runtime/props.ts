import type { Node, PropValue } from "@checkout-studio/schema"

import type { RenderContext } from "./context"

/**
 * Prop resolution.
 *
 * A prop may hold a reference rather than a value: `{ "$asset": "ast_9f2a" }`
 * or `{ "$var": "order.total" }`. Both are resolved here, before a component
 * sees anything — so no component ever handles a reference, and reference
 * syntax stays an engine concern.
 *
 * Recursive, because props hold nested structures. A list of features is an
 * array of objects, and each of those may carry an icon asset.
 *
 * Nothing is mutated. Every container is rebuilt, and a subtree with no
 * references is returned as-is, so a document that references nothing costs one
 * walk and no allocations.
 */

function isReference(value: object, key: "$asset" | "$var"): boolean {
  return key in value
}

function resolveValue(value: PropValue, node: Node, context: RenderContext): unknown {
  if (value === null || typeof value !== "object") return value

  if (Array.isArray(value)) {
    return value.map((entry) => resolveValue(entry, node, context))
  }

  if (isReference(value, "$asset")) {
    const assetId = (value as { $asset: string }).$asset
    const urls = context.resolveAsset(assetId)

    if (urls === null) {
      context.warn({
        code: "asset-missing",
        nodeId: node.id,
        message: `${node.id} references asset ${assetId}, which resolved to nothing.`,
      })
    }

    return urls
  }

  if (isReference(value, "$var")) {
    const name = (value as { $var: string }).$var

    if (Object.hasOwn(context.variables, name)) return context.variables[name]

    // Not an error. An order total arrives after the cart does, and a component
    // showing its declared fallback in the meantime is what the fallback is for.
    return context.document.variables[name]?.fallback ?? null
  }

  const resolved: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    resolved[key] = resolveValue(entry, node, context)
  }

  return resolved
}

/** A node's props, with every reference resolved. */
export function resolveProps(
  node: Node,
  context: RenderContext,
  defaults: Readonly<Record<string, PropValue>>,
): Readonly<Record<string, unknown>> {
  const merged = { ...defaults, ...node.props }
  const resolved: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(merged)) {
    resolved[key] = resolveValue(value, node, context)
  }

  return resolved
}
