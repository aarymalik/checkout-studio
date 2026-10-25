"use client"

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  SearchInput,
} from "@checkout-studio/ui"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { Breakpoint, CheckoutTheme } from "@checkout-studio/schema"
import type { ReactElement } from "react"

import { useRef, useState } from "react"

import { Control } from "./Control"
import { searchProperties } from "./search"
import { sectionsFor } from "./sections"

/**
 * The inspector's panel, built from what a component registered.
 *
 * ## It is given its properties, never asked for them
 *
 * This package cannot see a plugin — they are the same layer, and a plugin may
 * never be imported by the editor. So the application assembles the
 * definitions from the plugins it installed and hands them in, which is also
 * what makes the panel testable without a registry and what keeps "the engine
 * knows nothing about checkout" true of the inspector too.
 *
 * ## Nothing in here is hardcoded per component
 *
 * There is no `if (type === "core.heading")` and there is nowhere to put one.
 * A new component's inspector appears because the component registered
 * properties, which is Phase 12's exit criterion stated as code.
 *
 * ## Two empty states, because they mean different things
 *
 * Nothing selected is "pick something". A selected component with no
 * registered properties is "there is nothing to change here" — which is true
 * of a Spacer, and is not a fault.
 */

export interface PropertyInspectorProps {
  /** The properties the selected component registered, in registration order. */
  definitions: readonly PropertyDefinition[]
  /** What the node currently holds, keyed as the definitions are. */
  values: Readonly<Record<string, unknown>>
  onChange: (
    definition: PropertyDefinition,
    value: string | number | boolean | null,
    /** The key to write, when it is not the definition's own — a side writes its longhand. */
    key?: string,
  ) => void
  /** Keys whose value differs across a multi-selection. */
  mixedKeys?: ReadonlySet<string>
  /**
   * Keys the node holds itself, rather than inherits from the component.
   *
   * Only these are offered a reset, because resetting a value that is already
   * the component's own default is a button that does nothing — and a panel
   * where every property carries one says nothing about which have been
   * changed. `ownKeys` works this out from the node.
   */
  overridden?: ReadonlySet<string>
  /** Puts a property back to the component's default. Absent means no reset. */
  onReset?: (definition: PropertyDefinition) => void
  /**
   * The breakpoint being edited.
   *
   * The panel shows what is in force here, which at tablet means the tablet
   * override or the desktop value behind it. Only properties that asked to be
   * responsive are per-breakpoint: a prop cannot be, since the document stores
   * overrides for styles only, and a style that did not ask is edited at the
   * base wherever the canvas happens to be — so neither is described as having
   * an override.
   */
  breakpoint?: Breakpoint
  /**
   * Gives every breakpoint the value the one on screen has — ⌘↵, from inside
   * the field.
   *
   * Offered only for a property that is per-breakpoint, because for anything
   * else there is nothing to apply: a prop is one value already, and so is a
   * style whose definition never asked to be responsive.
   */
  onApplyToAll?: (definition: PropertyDefinition) => void
  /**
   * What to say beneath a control, keyed as the definitions are.
   *
   * The markup controls are why: the parser that strips a `<script>` knows
   * what it took out, and it belongs to a plugin this package cannot see.
   */
  notes?: Readonly<Record<string, readonly string[]>>
  /**
   * The theme whose tokens these properties may hold.
   *
   * Absent means no picker: the panel still works, it just offers literals —
   * which is what a test rendering it without a document gets.
   */
  theme?: CheckoutTheme
  /** Nothing is selected. */
  empty?: boolean
  disabled?: boolean
}

export function PropertyInspector({
  definitions,
  values,
  onChange,
  mixedKeys,
  overridden,
  onReset,
  breakpoint,
  onApplyToAll,
  notes,
  theme,
  empty = false,
  disabled = false,
}: PropertyInspectorProps): ReactElement {
  const [query, setQuery] = useState("")
  const field = useRef<HTMLInputElement>(null)

  if (empty) {
    return (
      <p className="p-4 text-small text-foreground-muted" data-inspector-state="no-selection">
        Select something on the canvas to edit it.
      </p>
    )
  }

  const all = sectionsFor(definitions, values)
  const { sections, matches } = searchProperties(all, query)

  if (all[0] === undefined) {
    return (
      <p className="p-4 text-small text-foreground-muted" data-inspector-state="no-properties">
        This component has nothing to configure.
      </p>
    )
  }

  // One row, built once. The searched view and the accordion both draw the
  // same controls, and a second copy of this call would be a second place for
  // a prop to be forgotten.
  function row(definition: PropertyDefinition, index: number): ReactElement {
    return (
      <Control
        /*
         * The index too: one key may be declared more than once when each is
         * shown under a different answer to the same question — Embed's `id`
         * is "Video ID" for one service and "Booking link" for another. Only
         * one survives `isShown`, but keying on the pair alone would be a
         * collision waiting for the day that stops being true.
         */
        key={`${definition.target}:${definition.key}:${String(index)}`}
        definition={definition}
        value={values[definition.key]}
        {...(theme === undefined ? {} : { theme })}
        mixed={mixedKeys?.has(definition.key) === true}
        {...(notes?.[definition.key] === undefined ? {} : { notes: notes[definition.key] })}
        {...(onReset === undefined || overridden?.has(definition.key) !== true
          ? {}
          : {
              onReset: () => {
                onReset(definition)
              },
              ...(breakpoint === undefined || definition.responsive !== true ? {} : { breakpoint }),
            })}
        {...(onApplyToAll === undefined || definition.responsive !== true
          ? {}
          : {
              onApplyToAll: () => {
                onApplyToAll(definition)
              },
            })}
        disabled={disabled}
        onChange={(next, key) => {
          onChange(definition, next, key)
        }}
      />
    )
  }

  return (
    <div
      className="flex min-h-0 flex-col"
      onKeyDown={(event) => {
        /*
         * ⌘F, which reserved.ts already lets this panel take from the browser:
         * "both are long lists, both have a search field, and in both a person
         * pressing ⌘F means find in this list".
         *
         * Handled where the field is rather than registered as a command,
         * because the command would have to find this field to focus it — and
         * the panel is the only thing that knows where it is.
         */
        if (event.key !== "f" || !(event.metaKey || event.ctrlKey)) return

        event.preventDefault()
        field.current?.focus()
        // Selected, not just focused: pressing it again means another search,
        // and the first one should not have to be deleted first.
        field.current?.select()
      }}
    >
      <div className="p-3 pb-2">
        <SearchInput
          ref={field}
          label="Search properties"
          placeholder="Search properties"
          value={query}
          onValueChange={setQuery}
          onKeyDown={(event) => {
            // Escape empties the field rather than leaving a filter somebody
            // has stopped looking at applied to the panel behind it.
            if (event.key !== "Escape") return

            event.preventDefault()
            setQuery("")
          }}
        />
      </div>

      {matches === 0 ? (
        <p className="p-3 text-small text-foreground-muted" data-inspector-state="no-matches">
          {`Nothing here is called "${query.trim()}".`}
        </p>
      ) : query.trim() === "" ? (
        // One open at a time, per docs/ui-guidelines.md: eleven open at once is
        // a wall rather than a panel.
        <Accordion type="single" defaultValue={all[0].group} collapsible>
          {sections.map((section) => (
            <AccordionItem key={section.group} value={section.group}>
              <AccordionHeader>{section.group}</AccordionHeader>

              <AccordionPanel>
                <div className="flex flex-col gap-4 p-3">{section.properties.map(row)}</div>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        /*
         * Results, not an accordion. One section open at a time is right for
         * browsing eleven of them and wrong for reading an answer: a search
         * that put its own matches behind closed headers would be asking the
         * question twice.
         *
         * The group still labels each run, because "Colour" means something
         * different under Typography than under Background.
         */
        <div className="flex flex-col gap-4 p-3" data-inspector-results={String(matches)}>
          {sections.map((section) => (
            <div key={section.group} className="flex flex-col gap-4">
              <p className="text-caption text-foreground-muted">{section.group}</p>

              {section.properties.map(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
