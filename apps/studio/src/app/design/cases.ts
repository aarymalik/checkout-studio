/**
 * Every visual case, as data.
 *
 * Plain data in a plain module, deliberately. The gallery page renders on the
 * server and the cases render in the browser, and a value imported across that
 * boundary arrives as a reference rather than as itself — the first version of
 * this file was one module, and `CASES.find` was not a function.
 *
 * The visual suite iterates over this list, the renderers are keyed by these
 * ids, and a test asserts that every component the library exports appears in
 * `covers`. A component with no case is a component nothing is watching.
 *
 * `covers` lists the components whose appearance a case exercises, which is not
 * always the same as the ones it names: an Input renders FieldLabel,
 * FieldDescription and FieldError, and a boundary renders ErrorFallback. What a
 * boundary *does* is covered by its unit tests; what it looks like is this.
 */
export interface GalleryCase {
  /** Also the screenshot's name, so it must stay stable. */
  id: string
  covers: readonly string[]
  /**
   * A selector to focus before the shutter.
   *
   * Without one a case is photographed with nothing focused, which is how the
   * focus ring went unwatched: the rule that draws it lives in reset.css, it
   * was unlayered and beat every `outline-none` in the product, and not one of
   * thirty-eight screenshots could have shown that. Changing it moved nothing.
   *
   * The focused case is photographed twice — the whole page, and again cropped
   * to this control, because a ring is too few pixels for a full-page
   * comparison to notice. See the crop in visual/gallery.spec.ts.
   */
  focus?: string
}

export const CASES: readonly GalleryCase[] = [
  /*
   * Focused, so the ring is in a baseline.
   *
   * This case rather than a case of its own: a ring is a thing a control wears
   * rather than a component in itself, and a picture of one on a button is
   * worth more than a picture of one on nothing.
   */
  { id: "button-variants", covers: ["Button"], focus: "button" },
  { id: "button-sizes", covers: ["Button"] },
  {
    id: "text-fields",
    covers: [
      "Input",
      "Textarea",
      "SearchInput",
      "FieldLabel",
      "FieldDescription",
      "FieldError",
      "FieldShell",
    ],
  },
  { id: "choices", covers: ["Checkbox", "RadioGroup", "Radio", "Switch", "Slider"] },
  { id: "select-open", covers: ["Select", "SelectOption", "SelectGroup", "SelectSeparator"] },
  {
    id: "tabs-and-accordion",
    covers: [
      "Tabs",
      "TabsList",
      "TabsTrigger",
      "TabsPanel",
      "Accordion",
      "AccordionItem",
      "AccordionHeader",
      "AccordionPanel",
    ],
  },
  { id: "feedback", covers: ["Alert", "Spinner", "Skeleton", "EmptyState"] },
  { id: "error-state", covers: ["ErrorState"] },
  { id: "table", covers: ["DataTable"] },
  { id: "upload", covers: ["FileUpload"] },
  { id: "layout", covers: ["Panel", "ScrollArea", "Splitter", "ResizablePanel"] },
  {
    id: "dialog-open",
    covers: ["Dialog", "DialogContent", "DialogFooter", "DialogTrigger", "DialogClose"],
  },
  {
    id: "popover-open",
    covers: [
      "Popover",
      "PopoverContent",
      "PopoverTrigger",
      "PopoverClose",
      "PopoverAnchor",
      "ColorPicker",
    ],
  },
  {
    id: "menu-open",
    covers: [
      "DropdownMenu",
      "DropdownMenuContent",
      "DropdownMenuItem",
      "DropdownMenuLabel",
      "DropdownMenuSeparator",
      "DropdownMenuTrigger",
      "DropdownMenuGroup",
      "DropdownMenuSub",
      "DropdownMenuSubContent",
      "DropdownMenuSubTrigger",
      "DropdownMenuCheckboxItem",
    ],
  },
  {
    id: "context-menu",
    covers: [
      "ContextMenu",
      "ContextMenuContent",
      "ContextMenuItem",
      "ContextMenuTrigger",
      "ContextMenuLabel",
      "ContextMenuSeparator",
      "ContextMenuGroup",
    ],
  },
  { id: "command-palette", covers: ["CommandPalette"] },
  { id: "toast", covers: ["ToastProvider"] },
  {
    id: "error-fallback",
    covers: [
      "ErrorFallback",
      "ErrorBoundary",
      "AppErrorBoundary",
      "RouteErrorBoundary",
      "PanelErrorBoundary",
    ],
  },
  { id: "tooltip", covers: ["Tooltip", "TooltipProvider"] },
]
