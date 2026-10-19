"use client"

import { Panel, Splitter } from "@checkout-studio/ui"
import { LAYOUT } from "@checkout-studio/design-system"
import {
  PropertyInspector,
  useEditorStore,
  useEditorStoreApi,
  useShellActions,
  useShellLayout,
  valuesFor,
} from "@checkout-studio/editor"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { CheckoutTheme } from "@checkout-studio/schema"
import type { ReactElement } from "react"

import { propertiesFor } from "./properties"

/**
 * The right inspector.
 *
 * ## It builds itself
 *
 * The sections and the controls come from what the selected component
 * registered. There is no branch on a type id here or in the panel, which is
 * Phase 12's exit criterion: a component a plugin adds tomorrow gets an
 * inspector without anybody editing this file.
 *
 * The definitions are assembled in `./properties` rather than reached for by
 * the editor package, because a plugin and the editor are the same layer and
 * neither may import the other.
 *
 * ## The primary selection
 *
 * `selection.ids` is ordered as selected and the first is the primary, which
 * is what this shows. Editing several at once is a later slice; until then a
 * multi-selection shows the first rather than nothing, because that is what
 * the ordering is for.
 *
 * See docs/ui-guidelines.md § Inspector.
 */

/** The selected component's properties, and what it currently holds. */
function Properties({ theme }: { theme: CheckoutTheme | null }): ReactElement {
  const store = useEditorStoreApi()
  const selected = useEditorStore((state) => {
    const [first] = state.selection.ids

    return first === undefined ? null : (state.document.nodes[first] ?? null)
  })

  if (selected === null) {
    return <PropertyInspector definitions={[]} values={{}} onChange={() => undefined} empty />
  }

  const definitions = propertiesFor(selected.type)

  function change(definition: PropertyDefinition, value: string | number | boolean | null): void {
    if (selected === null) return

    /*
     * Which bag a value goes into is the definition's to say. The two writes
     * group differently on purpose — `setProps` and `setStyles` each carry
     * their own group key, so holding an arrow key down is one undo entry
     * rather than forty.
     */
    if (definition.target === "prop") {
      store.getState().setProps(selected.id, { [definition.key]: value })

      return
    }

    store.getState().setStyles([selected.id], { [definition.key]: value })
  }

  return (
    <PropertyInspector
      definitions={definitions}
      values={valuesFor(selected, definitions)}
      {...(theme === null ? {} : { theme })}
      onChange={change}
    />
  )
}

export function Inspector({ theme }: { theme: CheckoutTheme | null }) {
  const layout = useShellLayout()
  const actions = useShellActions()

  if (layout.rightCollapsed) return null

  return (
    <div className="flex min-h-0">
      <Splitter
        label="Resize inspector"
        value={layout.rightWidth}
        min={LAYOUT.right.min}
        max={LAYOUT.right.max}
        side="end"
        onChange={actions.resizeRight}
      />

      <Panel
        id="shell-inspector"
        tabIndex={-1}
        title="Inspector"
        onCollapsedChange={() => actions.toggleRight()}
        side="end"
        // Inline width: it is a value the reader is dragging, not a design
        // decision, and there is no token for "however wide they left it".
        style={{ width: layout.rightWidth }}
        className="min-w-0"
      >
        <Properties theme={theme} />
      </Panel>
    </div>
  )
}
