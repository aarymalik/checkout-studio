"use client"

import { Panel, Splitter } from "@checkout-studio/ui"
import { LAYOUT } from "@checkout-studio/design-system"
import {
  PropertyInspector,
  useEditorStore,
  useEditorStoreApi,
  useShellActions,
  BASE_BREAKPOINT,
  ownKeys,
  shapesOf,
  useShellLayout,
  valuesFor,
} from "@checkout-studio/editor"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { BREAKPOINTS } from "@checkout-studio/schema"
import type { Breakpoint, CheckoutTheme } from "@checkout-studio/schema"
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
  /*
   * The breakpoint the canvas is showing. Editing at tablet writes a tablet
   * override, which is the whole of Phase 12's step 6 — and it comes from the
   * viewport rather than from a control of the panel's own, because the thing
   * being edited should be the thing on screen.
   */
  const breakpoint = useEditorStore((state) => state.viewport.breakpoint)

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
  const values = valuesFor(
    selected,
    definitions,
    {
      ...(component?.defaultProps === undefined ? {} : { props: component.defaultProps }),
      ...(component?.defaultStyles === undefined ? {} : { styles: component.defaultStyles }),
    },
    breakpoint,
  )

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

    store.getState().setStyles([selected.id], { [written]: value }, { breakpoint: at(definition) })
  }

  /**
   * Which breakpoint a style belongs to.
   *
   * The one on screen, if the property asked to be responsive. If it did not,
   * the base — the component declared the value is not per-breakpoint, and an
   * editor that wrote a tablet override anyway would create something it never
   * offered to show, since the panel would go on reading that property from
   * the base wherever the canvas was.
   */
  function at(definition: PropertyDefinition): Breakpoint {
    return definition.responsive === true ? breakpoint : BASE_BREAKPOINT
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
  // One padding is up to five keys; everything else is one.
  function keysOf(definition: PropertyDefinition): readonly string[] {
    return definition.control === "spacing" || definition.control === "radius"
      ? shapesOf(definition.key)
      : [definition.key]
  }

  function reset(definition: PropertyDefinition): void {
    if (selected === null) return

    const keys = keysOf(definition)

    if (definition.target === "prop") {
      store.getState().clearProps(selected.id, keys)

      return
    }

    store.getState().clearStyles([selected.id], keys, { breakpoint: at(definition) })
  }

  /**
   * Give every breakpoint the value this one has — ⌘↵.
   *
   * docs/keyboard-shortcuts.md states the need plainly: "I set this on desktop
   * and now I have to do it twice more."
   *
   * What it writes is the base, and what it removes is every override. Writing
   * the same literal into all three would look identical today and rot
   * tomorrow, because a later change to the desktop value would no longer
   * reach the other two — they would each be holding a copy. One value at the
   * base is what "the same everywhere" actually is.
   *
   * The clears come first and cover every shape. A shorthand written at the
   * base while longhands are still sitting there is two declarations for the
   * same property, and which of them wins is not something this panel should
   * be deciding.
   *
   * All of it inside one transaction, so it is one entry in history. Phase
   * 12's exit criteria ask for exactly that, and an undo that put back only
   * the mobile third of it would be worse than no undo.
   *
   * What is written is the value *in effect*, which for a side means the
   * sides nobody typed come across as the theme references they already were
   * — `4px {spacing.5} {spacing.9}` rather than `4px 24px 64px`. So the
   * padding goes on following the theme; what it stops following is the
   * component's own default, which it now holds a value instead of. That is
   * what the gesture says: this is the padding, everywhere.
   */
  function applyToAll(definition: PropertyDefinition): void {
    if (selected === null) return

    const value = values[definition.key]

    if (typeof value !== "string" && typeof value !== "number") return

    const keys = keysOf(definition)

    store.getState().transact("Apply to all breakpoints", () => {
      for (const across of BREAKPOINTS) {
        store.getState().clearStyles([selected.id], keys, { breakpoint: across })
      }

      store
        .getState()
        .setStyles([selected.id], { [definition.key]: value }, { breakpoint: BASE_BREAKPOINT })
    })
  }

  return (
    <PropertyInspector
      definitions={definitions}
      values={values}
      {...(theme === null ? {} : { theme })}
      overridden={ownKeys(selected, definitions, breakpoint)}
      breakpoint={breakpoint}
      onChange={change}
      onReset={reset}
      onApplyToAll={applyToAll}
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
