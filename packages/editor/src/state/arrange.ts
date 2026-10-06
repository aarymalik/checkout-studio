import { isLocked } from "./selectors"
import { indent, moveDown, moveUp, outdent } from "../layers/reorder"
import type { Move } from "../layers/reorder"
import type { Command, CommandDescriptor, EditorContext } from "../commands/types"
import type { EditorStoreApi } from "./store"

/**
 * Locking, hiding, and moving a node through the tree.
 *
 * All of it existed and none of it was a command. `setLocked` and `setHidden`
 * were reachable from two buttons on a layers row; `moveUp`, `moveDown`,
 * `indent` and `outdent` from Alt and an arrow key inside that same panel. So
 * docs/keyboard-shortcuts.md § Structure and § Movement described eight
 * bindings that did nothing, and the inline selection toolbar had no commands
 * to be a view over.
 *
 * Which is the point of building them this way. The toolbar, the palette, a
 * context menu and a keystroke are four ways to reach one definition — a
 * toolbar that called `setLocked` itself would be a fifth implementation of
 * locking and the first to disagree with the others.
 *
 * See docs/editor-behavior.md § Lock and § Hide.
 */

/**
 * One command, as a plan rather than a pair of answers.
 *
 * `plan` returns the thing to do, or null when there is nothing to do — so
 * "can this act?" and "what would it do?" are one question asked once.
 *
 * Written this way after the first version separated them. `available` asked
 * whether a move existed and `run` worked it out again, which meant `run` had
 * to handle a null it could never see: the caller had already refused. That is
 * the shape commands.ts warns about in its own table — "the lookups that
 * guarded against it were branches no test could reach because the thing they
 * guarded against could not happen". A branch like that is not covered by
 * writing a cleverer test; it is removed by not needing it.
 */
interface ArrangeCommandSpec {
  title: string
  keywords: readonly string[]
  plan: (api: EditorStoreApi) => (() => void) | null
  /** Toggle state, for a pressed toolbar button or a menu checkmark. */
  active?: (api: EditorStoreApi) => boolean
}

const selection = (api: EditorStoreApi): readonly string[] => api.getState().selection.ids

/**
 * Every selected node, when exactly one is selected and it may be moved.
 *
 * One, because `reorder` moves a single node: there is no rule written down
 * anywhere for what moving five nodes at once should do to their relative
 * order, and inventing one here would be inventing it in the wrong place. The
 * layers panel has the same limit, for the same reason.
 *
 * Locked nodes are excluded by docs/editor-behavior.md § Lock — "cannot move" —
 * and `isLocked` is self-or-ancestor, so a locked container protects everything
 * inside it.
 */
function movable(api: EditorStoreApi): string | null {
  const ids = selection(api)
  const id = ids[0]

  if (ids.length !== 1 || id === undefined) return null

  return isLocked(api.getState().document, id) ? null : id
}

/**
 * The move a step would produce, or null when there is nowhere to go.
 *
 * Also null when the destination is locked. Dropping a node into a locked
 * container changes that container's children, which is a change to the thing
 * that was locked.
 */
function stepFor(
  api: EditorStoreApi,
  step: (document: ReturnType<EditorStoreApi["getState"]>["document"], id: string) => Move | null,
): Move | null {
  const id = movable(api)

  if (id === null) return null

  const document = api.getState().document
  const move = step(document, id)

  return move === null || isLocked(document, move.parentId) ? null : move
}

/** A command for one of the four reordering steps, built from its function. */
function step(
  title: string,
  keywords: readonly string[],
  of: (document: ReturnType<EditorStoreApi["getState"]>["document"], id: string) => Move | null,
): ArrangeCommandSpec {
  return {
    title,
    keywords,
    plan: (api) => {
      const move = stepFor(api, of)

      if (move === null) return null

      return () => {
        api.getState().move(move.id, move.parentId, move.index)
      }
    },
  }
}

const ARRANGE_COMMANDS: Readonly<Record<string, ArrangeCommandSpec>> = {
  "arrange.lock": {
    title: "Lock / unlock",
    keywords: ["lock", "unlock", "freeze", "protect"],
    /*
     * The node's own flag, not `isLocked`.
     *
     * This button writes `metadata.locked`, so it has to report the thing it
     * writes. A node inside a locked container is not movable and the move
     * commands say so by being unavailable — but its own flag is off, and a
     * pressed lock button that unlocking does not release would be a lie.
     */
    active: (api) => {
      const { document } = api.getState()

      return selection(api).every((id) => document.nodes[id]?.metadata.locked === true)
    },
    // Planned whenever something is selected, including when it is already
    // locked: unlocking is the other half of this command.
    plan: (api) => {
      const ids = selection(api)

      if (ids.length === 0) return null

      const { document } = api.getState()
      // Any unlocked node means "lock everything"; only then does a second
      // press release them. Mixed selections need a defined direction.
      const locking = ids.some((id) => document.nodes[id]?.metadata.locked !== true)

      return () => {
        api.getState().setLocked(ids, locking)
      }
    },
  },

  "arrange.hide": {
    title: "Hide / show",
    keywords: ["hide", "show", "visible", "visibility", "eye"],
    active: (api) => {
      const { document } = api.getState()

      return selection(api).every((id) => document.nodes[id]?.visibility.hidden === true)
    },
    plan: (api) => {
      const ids = selection(api)

      if (ids.length === 0) return null

      const { document } = api.getState()
      const hiding = ids.some((id) => document.nodes[id]?.visibility.hidden !== true)

      return () => {
        api.getState().setHidden(ids, hiding)
      }
    },
  },

  "arrange.move-up": step("Move up", ["move", "up", "order", "earlier", "before"], moveUp),
  "arrange.move-down": step("Move down", ["move", "down", "order", "later", "after"], moveDown),
  "arrange.move-into": step(
    "Move into the container above",
    ["move", "into", "indent", "nest", "inside"],
    indent,
  ),
  "arrange.move-out": step(
    "Move out of its container",
    ["move", "out", "outdent", "unnest", "lift"],
    outdent,
  ),
}

export const arrangeCommandDescriptors: readonly CommandDescriptor[] = Object.entries(
  ARRANGE_COMMANDS,
).map(([id, spec]) => ({ id, title: spec.title, category: "arrange", keywords: spec.keywords }))

export interface ArrangeCommandOptions {
  /** Null before a page is open, and after one closes. */
  store: () => EditorStoreApi | null
}

/** Whether a command may act: there is a page, and this session may write to it. */
function writable(store: () => EditorStoreApi | null): EditorStoreApi | null {
  const api = store()

  if (api === null) return null

  return api.getState().persistence.canEdit ? api : null
}

export function createArrangeCommands({ store }: ArrangeCommandOptions): readonly Command[] {
  return Object.entries(ARRANGE_COMMANDS).map(([id, spec]) => ({
    id,
    title: spec.title,
    category: "arrange" as const,
    keywords: spec.keywords,
    isAvailable: (context: EditorContext) => {
      const api = writable(store)

      return api !== null && !context.isEditingText && spec.plan(api) !== null
    },
    /*
     * Only the two toggles have one. The reordering steps are actions, not
     * states, so they report no active state the way a zoom step does not.
     */
    isActive: (_context: EditorContext) => {
      const api = store()

      return api === null ? false : (spec.active?.(api) ?? false)
    },
    run: (context: EditorContext) => {
      const api = writable(store)

      if (api === null || context.isEditingText) return

      // Planned again rather than trusted: availability was decided before the
      // keystroke, and a page can close or the selection move between the two.
      spec.plan(api)?.()
    },
    mutates: true,
  }))
}
