import { canonicalJson } from "./normalize"
import type { CheckoutSchema, Node } from "./schema"

/**
 * What changed between two documents.
 *
 * Written for the conflict prompt, which has to tell somebody what they are
 * choosing between: "their changes: 4 nodes edited, 1 section added". A prompt
 * that says only "this page was changed elsewhere" asks a person to gamble.
 *
 * Node-level, not property-level. Which of a node's forty style properties
 * moved is not what anyone needs in order to choose, and computing it would
 * turn a summary into a diff nobody reads.
 *
 * See docs/history-versioning.md § Conflict Resolution.
 */

export interface DocumentDiff {
  added: readonly string[]
  removed: readonly string[]
  /** Changed in place: props, styles, metadata, or their children's order. */
  changed: readonly string[]
  /** Whether anything outside the node tree moved: theme, settings, variables. */
  settingsChanged: boolean
}

/** Everything about a node except where it sits, which is compared separately. */
function nodeSignature(node: Node): string {
  return canonicalJson({
    type: node.type,
    props: node.props,
    styles: node.styles,
    visibility: node.visibility,
    animations: node.animations,
    metadata: node.metadata,
    children: node.children,
    parentId: node.parentId,
  } as unknown as CheckoutSchema)
}

export function diff(before: CheckoutSchema, after: CheckoutSchema): DocumentDiff {
  const beforeIds = new Set(Object.keys(before.nodes))
  const afterIds = new Set(Object.keys(after.nodes))

  const added = [...afterIds].filter((id) => !beforeIds.has(id))
  const removed = [...beforeIds].filter((id) => !afterIds.has(id))
  const changed = [...beforeIds].filter((id) => {
    const right = after.nodes[id]

    if (right === undefined) return false

    return nodeSignature(before.nodes[id] as Node) !== nodeSignature(right)
  })

  const settingsChanged =
    canonicalJson({ ...before, nodes: {}, root: "" }) !==
    canonicalJson({ ...after, nodes: {}, root: "" })

  return { added, removed, changed, settingsChanged }
}

/** Whether two documents describe the same page. */
export function unchanged(diff: DocumentDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0 &&
    !diff.settingsChanged
  )
}

/**
 * The diff as a sentence, for the conflict prompt.
 *
 * Counts rather than ids: "4 nodes edited" is what helps somebody choose, and
 * "heading_h82k, text_9f2a, …" is not.
 */
export function summarize(diff: DocumentDiff): string {
  const parts: string[] = []

  if (diff.added.length > 0) parts.push(`${count(diff.added.length, "node")} added`)
  if (diff.removed.length > 0) parts.push(`${count(diff.removed.length, "node")} deleted`)
  if (diff.changed.length > 0) parts.push(`${count(diff.changed.length, "node")} edited`)
  if (diff.settingsChanged) parts.push("page settings changed")

  return parts.length === 0 ? "no changes" : parts.join(", ")
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`
}
