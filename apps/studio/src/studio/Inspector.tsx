"use client"

import { Panel, Splitter } from "@checkout-studio/ui"
import { LAYOUT } from "@checkout-studio/design-system"
import {
  PropertyInspector,
  useEditorStore,
  useEditorStoreApi,
  useShellActions,
  ownKeys,
  shapesOf,
  useShellLayout,
  valuesFor,
} from "@checkout-studio/editor"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { CheckoutTheme } from "@checkout-studio/schema"
import type { ReactElement } from "react"

import { propertiesFor } from "./properties"
import { registry } from "./registry"

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
  /*
   * The component's own defaults are stage two of the cascade, and most of
   * what a fresh node shows comes from there rather than from the node. The
   * panel read only the node and so showed empty boxes beside a canvas that
   * plainly had padding on it.
   */
  const component = registry.get(selected.type)

  function change(
    definition: PropertyDefinition,
    value: string | number | boolean | null,
    key?: string,
  ): void {
    if (selected === null) return

    const written = key ?? definition.key

    /*
     * Which bag a value goes into is the definition's to say. The two writes
     * group differently on purpose — `setProps` and `setStyles` each carry
     * their own group key, so holding an arrow key down is one undo entry
     * rather than forty.
     */
    if (definition.target === "prop") {
      store.getState().setProps(selected.id, { [written]: value })

      return
    }

    store.getState().setStyles([selected.id], { [written]: value })
  }

  /**
   * Put a property back to what the component ships.
   *
   * A delete, not a write of the default. Writing it back would look the same
   * and mean something else: the node would then hold that value itself, so a
   * later change to the component's default — or to the theme token it
   * references — would stop reaching it. What a reset restores is inheritance.
   *
   * A side clears every shape it could be hiding under, because one padding is
   * up to five keys and leaving four behind is a button that does nothing.
   */
  function reset(definition: PropertyDefinition): void {
    if (selected === null) return

    const keys =
      definition.control === "spacing" || definition.control === "radius"
        ? shapesOf(definition.key)
        : [definition.key]

    if (definition.target === "prop") {
      store.getState().clearProps(selected.id, keys)

      return
    }

    store.getState().clearStyles([selected.id], keys)
  }

  return (
    <PropertyInspector
      definitions={definitions}
      values={valuesFor(selected, definitions, {
        ...(component?.defaultProps === undefined ? {} : { props: component.defaultProps }),
        ...(component?.defaultStyles === undefined ? {} : { styles: component.defaultStyles }),
      })}
      {...(theme === null ? {} : { theme })}
      overridden={ownKeys(selected, definitions)}
      onChange={change}
      onReset={reset}
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
