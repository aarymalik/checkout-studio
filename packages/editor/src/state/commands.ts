import type { Command, CommandDescriptor, EditorContext } from "../commands/types"
import { canRedo, canUndo } from "./selectors"
import type { EditorStoreApi } from "./store"

/**
 * Undo, redo, and the clipboard.
 *
 * The store has had all of this since Phase 5 — a fifty-state history, copy,
 * cut, paste, paste-in-place, paste-styles, duplicate and delete, each tested.
 * None of it was reachable: there were no `edit` commands at all, so every
 * shortcut in docs/keyboard-shortcuts.md § History and § Editing did nothing,
 * and the toolbar's undo button was hidden behind a `commands.has("edit.undo")`
 * that was always false.
 *
 * Which made every other feature unsafe. Reordering a layer, renaming a node,
 * resizing a box — all of it landed with no way back.
 *
 * They need a store, and the registry is built once for the application, so the
 * store arrives as a getter that may answer null and a command with nothing to
 * act on reports itself unavailable.
 *
 * See docs/keyboard-shortcuts.md § History and § Editing.
 */

/**
 * One table, from which both the descriptors and the commands are derived.
 *
 * Kept together so a command cannot be half-defined: an id with a title and no
 * behaviour used to be possible, and the lookups that guarded against it were
 * branches no test could reach because the thing they guarded against could not
 * happen.
 *
 * `available` answers "can this do anything right now", and the three gates are
 * different questions. Undo needs something to undo. The clipboard needs
 * something on it, or something selected to put there. And none of them runs
 * while a text field has focus: the text guard lets ⌘Z and ⌘C through to the
 * field on purpose, so a document-level undo firing there would throw away a
 * node instead of a character.
 */
interface EditCommandSpec {
  title: string
  keywords: readonly string[]
  available: (api: EditorStoreApi) => boolean
  run: (api: EditorStoreApi) => void
}

const selected = (api: EditorStoreApi): boolean => api.getState().selection.ids.length > 0
const copied = (api: EditorStoreApi): boolean => api.getState().clipboard.fragment !== null

const EDIT_COMMANDS: Readonly<Record<string, EditCommandSpec>> = {
  "edit.undo": {
    title: "Undo",
    keywords: ["back", "revert", "mistake"],
    available: (api) => canUndo(api.getState()),
    run: (api) => {
      api.getState().undo()
    },
  },
  "edit.redo": {
    title: "Redo",
    keywords: ["forward", "again"],
    available: (api) => canRedo(api.getState()),
    run: (api) => {
      api.getState().redo()
    },
  },
  "edit.copy": {
    title: "Copy",
    keywords: ["clipboard", "duplicate"],
    available: selected,
    run: (api) => {
      api.getState().copy()
    },
  },
  "edit.cut": {
    title: "Cut",
    keywords: ["clipboard", "move", "remove"],
    available: selected,
    run: (api) => {
      api.getState().cut()
    },
  },
  "edit.paste": {
    title: "Paste",
    keywords: ["clipboard", "insert"],
    available: copied,
    run: (api) => {
      api.getState().paste()
    },
  },
  "edit.paste-in-place": {
    title: "Paste in place",
    keywords: ["clipboard", "same", "position"],
    available: copied,
    run: (api) => {
      api.getState().pasteInPlace()
    },
  },
  "edit.paste-styles": {
    title: "Paste styles only",
    keywords: ["clipboard", "appearance", "format"],
    // Styles go somewhere. Without a target there is nothing to paste onto.
    available: (api) => copied(api) && selected(api),
    run: (api) => {
      api.getState().pasteStyles()
    },
  },
  "edit.duplicate": {
    title: "Duplicate",
    keywords: ["copy", "clone", "again"],
    available: selected,
    run: (api) => {
      api.getState().duplicate(api.getState().selection.ids)
    },
  },
  "edit.delete": {
    title: "Delete",
    keywords: ["remove", "erase"],
    available: selected,
    run: (api) => {
      api.getState().remove(api.getState().selection.ids)
    },
  },
}

export const editCommandDescriptors: readonly CommandDescriptor[] = Object.entries(
  EDIT_COMMANDS,
).map(([id, spec]) => ({ id, title: spec.title, category: "edit", keywords: spec.keywords }))

export interface EditCommandOptions {
  /** Null before a page is open, and after one closes. */
  store: () => EditorStoreApi | null
}

/** Whether a command may act: there is a page, and this session may write to it. */
function writable(store: () => EditorStoreApi | null): EditorStoreApi | null {
  const api = store()

  if (api === null) return null

  return api.getState().persistence.canEdit ? api : null
}

export function createEditCommands({ store }: EditCommandOptions): readonly Command[] {
  return Object.entries(EDIT_COMMANDS).map(([id, spec]) => ({
    id,
    title: spec.title,
    category: "edit" as const,
    keywords: spec.keywords,
    isAvailable: (context: EditorContext) => {
      const api = writable(store)

      return api !== null && !context.isEditingText && spec.available(api)
    },
    run: (context: EditorContext) => {
      const api = writable(store)

      // Checked again rather than trusted: availability was decided before the
      // keystroke, and a page can close between the two.
      if (api === null || context.isEditingText || !spec.available(api)) return

      spec.run(api)
    },
    /*
     * Every one of these changes the document — including undo, which is a
     * change like any other as far as autosave is concerned: it has to be
     * written, or reloading brings back what was undone.
     */
    mutates: true,
  }))
}
