"use client"

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Panel,
  Splitter,
} from "@checkout-studio/ui"
import { LAYOUT } from "@checkout-studio/design-system"
import { useShellActions, useShellLayout } from "@checkout-studio/editor"

/**
 * The right inspector.
 *
 * The eleven sections from docs/ui-guidelines.md, as an accordion with one open.
 * Each section says what it will hold rather than showing a disabled control,
 * because a greyed slider teaches somebody that the product is broken while an
 * empty section tells them the truth.
 *
 * The properties themselves need a selected node, which needs the state engine.
 *
 * See docs/ui-guidelines.md § Inspector.
 */

const SECTIONS = [
  { id: "general", label: "General", waitingFor: "Name, tag and visibility." },
  { id: "layout", label: "Layout", waitingFor: "Direction, alignment and sizing." },
  { id: "spacing", label: "Spacing", waitingFor: "Padding, margin and gap." },
  { id: "typography", label: "Typography", waitingFor: "Family, size, weight and leading." },
  { id: "background", label: "Background", waitingFor: "Colour, gradient and image." },
  { id: "border", label: "Border", waitingFor: "Width, style, colour and radius." },
  { id: "effects", label: "Effects", waitingFor: "Shadow, blur and opacity." },
  { id: "animation", label: "Animation", waitingFor: "Entrance, hover and scroll." },
  { id: "responsive", label: "Responsive", waitingFor: "Per-breakpoint overrides." },
  { id: "accessibility", label: "Accessibility", waitingFor: "Labels, roles and focus order." },
  { id: "advanced", label: "Advanced", waitingFor: "Custom attributes and classes." },
] as const

export function Inspector() {
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
        {/* One section open, per the guidelines: eleven open at once is a wall. */}
        <Accordion type="single" defaultValue="general" collapsible>
          {SECTIONS.map((section) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionHeader>{section.label}</AccordionHeader>
              <AccordionPanel>
                <p className="text-caption text-foreground-muted">{section.waitingFor}</p>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </Panel>
    </div>
  )
}
