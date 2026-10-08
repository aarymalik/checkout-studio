import { moveRefusal, type CheckoutSchema, type Node } from "@checkout-studio/schema"

import { isLocked } from "../state/selectors"

/**
 * Whether something may be dropped where the pointer is, and why not.
 *
 * Phase 8's exit criteria are that no drag can produce an invalid tree and that
 * every rejection explains itself. Both of those need the answer *before* the
 * pointer comes up — a drag that looks fine and then refuses on release is a
 * drag that taught the user nothing.
 *
 * Which is why the schema's own rules are called rather than restated.
 * `moveRefusal` is the function `move` itself uses, so the reason shown while
 * dragging is the reason the operation would give. A second copy of these rules
 * in the drag layer is a second copy that drifts, and the day it drifts is the
 * day the indicator promises a drop that then fails.
 *
 * On top of them sit the two rules the engine has no opinion about: locking,
 * which is an editor concept, and which components take children, which belongs
 * to the component library.
 *
 * See docs/editor-behavior.md § Lock and docs/phases.md Phase 8 § Validity.
 */

export type RejectionCode =
  /** The schema refused: into itself, into its own descendant, no such node. */
  | "cycle"
  | "missing-node"
  | "missing-parent"
  | "root-immovable"
  | "rejects-children"
  /** The node being dragged is locked, or sits inside something locked. */
  | "locked-source"
  /** The destination is locked, or sits inside something locked. */
  | "locked-destination"

export interface Rejection {
  code: RejectionCode
  /** Shown to the user, so it says what is wrong rather than naming a rule. */
  message: string
  /** The nodes the message is about, for highlighting them. */
  nodeIds: readonly string[]
}

export interface DropRules {
  /**
   * Whether a node may hold children.
   *
   * Omitted means yes, which is the only answer something that knows nothing
   * about components can honestly give — the same contract as
   * `TreeOptions.canHaveChildren`, which this is handed to.
   */
  canHaveChildren?: (node: Node) => boolean
  /** What to call a node in a message. Falls back to its id. */
  nameOf?: (node: Node) => string
}

/** What to call a node when explaining a refusal to a person. */
function name(document: CheckoutSchema, id: string, rules: DropRules): string {
  const node = document.nodes[id]

  if (node === undefined) return id

  return rules.nameOf?.(node) ?? node.metadata.name ?? id
}

/**
 * Why `ids` may not become children of `parentId`, or null when they may.
 *
 * The first refusal wins, and the order is deliberate: a lock is a decision
 * somebody made and is worth saying so, while a cycle is a thing that cannot
 * be. Told "this is locked" a user knows what to do next; told "that would
 * make a loop" about a locked node, they would unlock it and hit the loop.
 */
export function dropRejection(
  document: CheckoutSchema,
  ids: readonly string[],
  parentId: string,
  rules: DropRules = {},
): Rejection | null {
  if (isLocked(document, parentId)) {
    return {
      code: "locked-destination",
      message: `${name(document, parentId, rules)} is locked, so nothing can be moved into it.`,
      nodeIds: [parentId],
    }
  }

  for (const id of ids) {
    if (isLocked(document, id)) {
      return {
        code: "locked-source",
        message: `${name(document, id, rules)} is locked, so it cannot be moved.`,
        nodeIds: [id],
      }
    }
  }

  for (const id of ids) {
    const refusal = moveRefusal(
      document,
      id,
      parentId,
      rules.canHaveChildren === undefined ? {} : { canHaveChildren: rules.canHaveChildren },
    )

    if (refusal === null) continue

    return {
      // Narrowed from the schema's wider set: the codes `move` can answer with
      // here are exactly these, and a drag cannot reach the others.
      code: refusal.code as RejectionCode,
      message: explain(document, refusal.code, id, parentId, rules),
      nodeIds: refusal.nodeIds,
    }
  }

  return null
}

/**
 * The refusal, said to a person rather than to a developer.
 *
 * The schema's messages name ids because the schema has no names — `"nod_8f2a"
 * is inside "nod_01b3"` is true and useless. These say the same thing about
 * things the user can see.
 */
function explain(
  document: CheckoutSchema,
  code: string,
  id: string,
  parentId: string,
  rules: DropRules,
): string {
  const moving = name(document, id, rules)
  const destination = name(document, parentId, rules)

  switch (code) {
    case "cycle":
      return id === parentId
        ? `${moving} cannot be moved into itself.`
        : `${moving} cannot be moved inside itself.`
    case "rejects-children":
      return `${destination} does not take components.`
    case "root-immovable":
      return "The page itself cannot be moved."
    case "missing-parent":
      return "That place is no longer there."
    default:
      return `${moving} is no longer there.`
  }
}

/**
 * Why a new component may not be put into `parentId`, or null when it may.
 *
 * Separate from `dropRejection`, and not an empty-ids call to it, because the
 * two ask different questions. Moving a node can make a cycle and can move
 * something locked; inserting one can do neither — there is no node yet. What
 * is left is the destination: whether it exists, whether it is locked, and
 * whether it takes children at all.
 *
 * The last of those is the reason this function exists rather than reusing the
 * other with no ids. `dropRejection` asks "does the parent accept children"
 * inside its per-id loop, so with nothing being moved it never asks — and an
 * insert into a heading would have been allowed by a check that looked like it
 * covered it.
 */
export function insertRejection(
  document: CheckoutSchema,
  parentId: string,
  rules: DropRules = {},
): Rejection | null {
  const parent = document.nodes[parentId]

  if (parent === undefined) {
    return {
      code: "missing-parent",
      message: "That place is no longer there.",
      nodeIds: [parentId],
    }
  }

  if (isLocked(document, parentId)) {
    return {
      code: "locked-destination",
      message: `${name(document, parentId, rules)} is locked, so nothing can be added to it.`,
      nodeIds: [parentId],
    }
  }

  if (rules.canHaveChildren?.(parent) === false) {
    return {
      code: "rejects-children",
      message: `${name(document, parentId, rules)} does not take components.`,
      nodeIds: [parentId],
    }
  }

  return null
}

/** Whether a new component may be put there, for the yes-or-no cases. */
export function canInsert(
  document: CheckoutSchema,
  parentId: string,
  rules: DropRules = {},
): boolean {
  return insertRejection(document, parentId, rules) === null
}

/** Whether a drop is allowed, for the cases that only need yes or no. */
export function canDrop(
  document: CheckoutSchema,
  ids: readonly string[],
  parentId: string,
  rules: DropRules = {},
): boolean {
  return dropRejection(document, ids, parentId, rules) === null
}
