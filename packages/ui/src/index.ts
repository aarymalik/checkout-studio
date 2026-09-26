/**
 * @checkout-studio/ui — the Studio component library.
 *
 * shadcn-style owned code on Radix primitives: the behaviour that is genuinely
 * hard — focus trapping, typeahead, roving focus, portalled positioning — comes
 * from a library that has been tested against real assistive technology, while
 * the markup and every style stay ours to change.
 *
 * Nothing here carries a value of its own. Every colour, size, radius and
 * duration is a token from @checkout-studio/design-system, enforced by
 * `pnpm tokens:check`.
 */

export { cn } from "./lib/cn"

// Primitives
export { Button, buttonVariants } from "./primitives/Button"
export type { ButtonProps } from "./primitives/Button"

export { Input, inputVariants } from "./primitives/Input"
export type { InputProps } from "./primitives/Input"

export { Textarea } from "./primitives/Textarea"
export type { TextareaProps } from "./primitives/Textarea"

export { Checkbox } from "./primitives/Checkbox"
export type { CheckboxProps } from "./primitives/Checkbox"

export { Radio, RadioGroup } from "./primitives/RadioGroup"
export type { RadioGroupProps, RadioProps } from "./primitives/RadioGroup"

export { Switch } from "./primitives/Switch"
export type { SwitchProps } from "./primitives/Switch"

export { Select, SelectGroup, SelectOption, SelectSeparator } from "./primitives/Select"
export type { SelectGroupProps, SelectOptionProps, SelectProps } from "./primitives/Select"

export { Tabs, TabsList, TabsPanel, TabsTrigger } from "./primitives/Tabs"

export { Accordion, AccordionHeader, AccordionItem, AccordionPanel } from "./primitives/Accordion"
export type { AccordionHeaderProps } from "./primitives/Accordion"

export { Slider } from "./primitives/Slider"
export type { SliderProps } from "./primitives/Slider"

export { ColorPicker } from "./primitives/ColorPicker"
export type { ColorPickerProps } from "./primitives/ColorPicker"

// The parts a labelled control is built from, for composing a control the
// library does not have yet.
export {
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldShell,
  useFieldAria,
} from "./primitives/field"
export type { FieldProps } from "./primitives/field"

// Overlays
export { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "./overlays/Dialog"
export type { DialogContentProps, DialogProps } from "./overlays/Dialog"

export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "./overlays/Popover"
export type { PopoverContentProps } from "./overlays/Popover"

export { Tooltip, TooltipProvider } from "./overlays/Tooltip"
export type { TooltipProps } from "./overlays/Tooltip"

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./overlays/DropdownMenu"
export type { DropdownMenuItemProps } from "./overlays/DropdownMenu"

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./overlays/ContextMenu"
export type { ContextMenuItemProps } from "./overlays/ContextMenu"

// Composites
export { DataTable } from "./composites/DataTable"
export type { Column, DataTableProps, SortDirection } from "./composites/DataTable"

export { SearchInput } from "./composites/SearchInput"
export type { SearchInputProps } from "./composites/SearchInput"

export { FileUpload } from "./composites/FileUpload"
export type { FileUploadProps } from "./composites/FileUpload"

export { CommandPalette } from "./composites/CommandPalette"
export type { CommandPaletteProps, PaletteItem } from "./composites/CommandPalette"

export { PALETTE_MODES, parseQuery } from "./composites/parseQuery"
export type { PaletteMode, ParsedQuery } from "./composites/parseQuery"

// Feedback
export { Spinner } from "./feedback/Spinner"
export type { SpinnerProps } from "./feedback/Spinner"

export { Alert } from "./feedback/Alert"
export type { AlertProps } from "./feedback/Alert"

export { Skeleton } from "./feedback/Skeleton"

export { EmptyState } from "./feedback/EmptyState"
export type { EmptyStateProps } from "./feedback/EmptyState"

export { ErrorState } from "./feedback/ErrorState"
export type { ErrorStateProps } from "./feedback/ErrorState"

export { ToastProvider, useToast } from "./feedback/Toast"
export type { Toast, ToastInput, ToastVariant } from "./feedback/Toast"
