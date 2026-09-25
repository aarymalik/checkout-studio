import * as RadixAccordion from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * An accordion.
 *
 * Each header is a button inside a heading, which is what lets a screen reader
 * user jump between sections by heading rather than reading through all of them.
 * Radix wires `aria-expanded` and `aria-controls` to the panel it actually
 * controls.
 */
export const Accordion = RadixAccordion.Root

export function AccordionItem({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixAccordion.Item>) {
  return <RadixAccordion.Item className={cn("border-b border-border", className)} {...props} />
}

export interface AccordionHeaderProps extends ComponentPropsWithRef<typeof RadixAccordion.Trigger> {
  /**
   * The heading level this section sits at.
   *
   * Defaults to 3, which is right inside a panel under an h2. A document whose
   * headings skip a level is harder to navigate than one with none.
   */
  level?: 2 | 3 | 4
  children: ReactNode
}

export function AccordionHeader({
  className,
  level = 3,
  children,
  ...props
}: AccordionHeaderProps) {
  return (
    <RadixAccordion.Header asChild>
      <h3
        // Radix renders its own h3 by default; this makes the level explicit so
        // a section can sit correctly in whatever document surrounds it.
        role="heading"
        aria-level={level}
        className="flex"
      >
        <RadixAccordion.Trigger
          className={cn(
            "group flex flex-1 items-center justify-between gap-2 py-3",
            "text-body font-medium text-foreground text-left",
            "transition-colors duration-fast ease-standard outline-none",
            "hover:text-foreground-muted",
            className,
          )}
          {...props}
        >
          {children}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-foreground-muted",
              "transition-transform duration-fast ease-standard",
              "group-data-[state=open]:rotate-180",
            )}
          />
        </RadixAccordion.Trigger>
      </h3>
    </RadixAccordion.Header>
  )
}

export function AccordionPanel({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixAccordion.Content>) {
  return (
    <RadixAccordion.Content
      className={cn("overflow-hidden pb-3 text-body text-foreground-muted", className)}
      {...props}
    />
  )
}
