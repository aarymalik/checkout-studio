"use client"

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  EmptyState,
  ScrollArea,
} from "@checkout-studio/ui"
import type { ReactElement } from "react"

import { useProjectTheme } from "./ProjectTheme"
import { Brand } from "./sections/Brand"
import { Components } from "./sections/Components"
import { DarkMode } from "./sections/DarkMode"
import { Radius } from "./sections/Radius"
import { Shadows } from "./sections/Shadows"
import { Spacing } from "./sections/Spacing"
import { Typography } from "./sections/Typography"
import type { SectionProps } from "./sections/section"

/**
 * The Theme panel.
 *
 * docs/theme-system.md § Editor Integration puts it in the left sidebar and
 * lists what it holds: Brand, Colors, Typography, Spacing, Radius, Shadows,
 * Components, Dark Mode. The sections that exist are here; the rest arrive
 * with their features rather than as empty headings, for the same reason the
 * sidebar's own tabs say what is coming instead of showing nothing.
 *
 * ## Why an accordion and not a list
 *
 * A theme has more decisions in it than fit on a screen, and they are not
 * decisions a person makes together: choosing a brand colour and tuning the
 * elevation ramp are separate sittings. One section open at a time keeps the
 * panel the height of the thing being worked on. Several at once is allowed,
 * because comparing a radius against a shadow is a real thing to want.
 *
 * ## Each section is handed the theme
 *
 * Rather than reading it from context itself. The check for whether there is a
 * theme at all happens once, here, and a section given its values is a section
 * a test can render without a provider around it.
 */

interface Section {
  id: string
  title: string
  Body: (props: SectionProps) => ReactElement
}

const SECTIONS: readonly Section[] = [
  { id: "brand", title: "Brand", Body: Brand },
  { id: "typography", title: "Typography", Body: Typography },
  { id: "spacing", title: "Spacing", Body: Spacing },
  { id: "radius", title: "Radius", Body: Radius },
  { id: "shadows", title: "Shadows", Body: Shadows },
  { id: "components", title: "Components", Body: Components },
  { id: "dark-mode", title: "Dark mode", Body: DarkMode },
]

/**
 * Brand, because it is the one decision most projects make and the only one
 * whose effect is visible everywhere at once.
 */
const OPEN_FIRST = ["brand"]

export function ThemePanel(): ReactElement {
  const project = useProjectTheme()

  if (project === null) {
    return (
      <EmptyState
        title="No project theme"
        description="Open a page to edit the theme it renders with."
      />
    )
  }

  const { theme, update } = project

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Accordion type="multiple" defaultValue={OPEN_FIRST} className="flex flex-col px-3">
        {SECTIONS.map(({ id, title, Body }) => (
          <AccordionItem key={id} value={id}>
            <AccordionHeader>{title}</AccordionHeader>
            <AccordionPanel>
              <Body theme={theme} update={update} />
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </ScrollArea>
  )
}

/** What the sidebar shows beside the panel's name. */
export function ThemeSaveStatus(): ReactElement | null {
  const project = useProjectTheme()

  if (project === null || project.status === "saved") return null

  const words: Record<Exclude<typeof project.status, "saved">, string> = {
    unsaved: "Unsaved",
    saving: "Saving…",
    error: "Not saved",
  }

  return (
    <p
      role="status"
      data-theme-status={project.status}
      className={
        project.status === "error"
          ? "text-caption text-danger"
          : "text-caption text-foreground-muted"
      }
    >
      {words[project.status]}
    </p>
  )
}
