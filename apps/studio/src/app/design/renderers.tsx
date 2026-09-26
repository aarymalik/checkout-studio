"use client"

import { Copy, Inbox, Trash2 } from "lucide-react"
import { useEffect } from "react"
import type { ReactNode } from "react"
import { Errors } from "@checkout-studio/utils"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Alert,
  Button,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  CommandPalette,
  DataTable,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorFallback,
  ErrorState,
  FileUpload,
  Input,
  Panel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Radio,
  RadioGroup,
  ScrollArea,
  SearchInput,
  Select,
  SelectGroup,
  SelectOption,
  SelectSeparator,
  Skeleton,
  Slider,
  Spinner,
  Splitter,
  Switch,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Textarea,
  ToastProvider,
  Tooltip,
  TooltipProvider,
  useToast,
} from "@checkout-studio/ui"

interface Page {
  id: string
  name: string
  views: number
}

const PAGES: readonly Page[] = [
  { id: "a", name: "Home", views: 30 },
  { id: "b", name: "Checkout", views: 120 },
]

/**
 * What each case looks like.
 *
 * Keyed by the ids in ./cases, which a test holds the two to. A client module,
 * because almost everything here uses hooks — and because the page that renders
 * it is a server component, the data it iterates over lives in a plain module
 * beside this one.
 *
 * Overlays are rendered open: a closed overlay is a screenshot of its trigger.
 */
export const RENDERERS: Record<string, () => ReactNode> = {
  "button-variants": () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled>Disabled</Button>
      <Button loading>Loading</Button>
    </div>
  ),
  "button-sizes": () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
  "text-fields": () => (
    <div className="flex w-80 flex-col gap-4">
      <Input label="Page name" defaultValue="Home" />
      <Input label="Slug" description="Used in the page URL" defaultValue="home" />
      <Input label="Email" error="Enter a valid email address" defaultValue="not-an-email" />
      <Input label="Disabled" disabled defaultValue="Locked" />
      <Textarea label="Description" defaultValue="Two lines of text." />
      <SearchInput
        label="Search pages"
        labelHidden={false}
        value="check"
        onValueChange={() => {}}
      />
    </div>
  ),
  choices: () => (
    <div className="flex w-80 flex-col gap-4">
      <Checkbox label="Collect billing address" defaultChecked />
      <Checkbox label="Partially selected" checked="indeterminate" />
      <Checkbox label="With an error" error="You must accept the terms" />
      <RadioGroup label="Plan" defaultValue="pro">
        <Radio value="free" label="Free" />
        <Radio value="pro" label="Pro" description="Custom domains" />
      </RadioGroup>
      <Switch label="Live mode" defaultChecked />
      <Slider label="Opacity" defaultValue={[60]} formatValue={([value]) => `${value ?? 0}%`} />
    </div>
  ),
  "select-open": () => (
    <div className="w-80">
      <Select label="Currency" defaultValue="gbp" open>
        <SelectGroup label="Common">
          <SelectOption value="gbp">Pound sterling</SelectOption>
          <SelectOption value="usd">US dollar</SelectOption>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup label="Other">
          <SelectOption value="jpy">Japanese yen</SelectOption>
        </SelectGroup>
      </Select>
    </div>
  ),
  "tabs-and-accordion": () => (
    <div className="flex w-96 flex-col gap-6">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsPanel value="general">General settings</TabsPanel>
      </Tabs>

      <Accordion type="single" collapsible defaultValue="shipping">
        <AccordionItem value="shipping">
          <AccordionHeader>Shipping</AccordionHeader>
          <AccordionPanel>Two to three days.</AccordionPanel>
        </AccordionItem>
        <AccordionItem value="returns">
          <AccordionHeader>Returns</AccordionHeader>
          <AccordionPanel>Thirty days.</AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  ),
  feedback: () => (
    <div className="flex w-96 flex-col gap-4">
      <Alert variant="info" title="Draft saved" />
      <Alert variant="success" title="Page published">
        It is live at example.com.
      </Alert>
      <Alert variant="warning" title="Slow to load">
        One image is larger than 2 MB.
      </Alert>
      <Alert variant="danger" title="Payment failed" onDismiss={() => {}}>
        The card was declined.
      </Alert>
      <div className="flex items-center gap-4">
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <EmptyState
        icon={<Inbox />}
        title="No pages yet"
        description="Create one to get started."
        action={<Button size="sm">New page</Button>}
      />
    </div>
  ),
  "error-state": () => (
    <div className="w-96">
      <ErrorState
        error={Errors.validation.invalidInput([
          { path: "name", code: "required", message: "Name is required." },
        ])}
        onRetry={() => {}}
      />
    </div>
  ),
  table: () => (
    <div className="w-96">
      <DataTable
        caption="Pages in this project"
        columns={[
          {
            id: "name",
            header: "Name",
            cell: (page) => page.name,
            compare: (a, b) => a.name.localeCompare(b.name),
          },
          { id: "views", header: "Views", cell: (page) => page.views, align: "end" },
        ]}
        rows={PAGES}
        rowId={(page) => page.id}
        selection={{
          selected: new Set(["a"]),
          onChange: () => {},
          label: (page) => `Select ${page.name}`,
        }}
      />
    </div>
  ),
  upload: () => (
    <div className="w-96">
      <FileUpload
        label="Add an image"
        description="PNG or JPEG"
        maxSize={5 * 1024 * 1024}
        onFilesChange={() => {}}
      />
    </div>
  ),
  layout: () => (
    <div className="flex h-64 w-96 border border-border">
      <Panel
        title="Layers"
        className="w-48"
        actions={
          <Button size="sm" variant="ghost">
            Add
          </Button>
        }
      >
        <ScrollArea label="Layer list">
          <ul className="flex flex-col gap-2">
            {["Header", "Hero", "Form", "Footer"].map((layer) => (
              <li key={layer} className="text-body text-foreground">
                {layer}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </Panel>
      <Splitter label="Resize Layers" value={192} min={160} max={320} onChange={() => {}} />
      <div className="flex-1 bg-canvas" />
    </div>
  ),
  "dialog-open": () => (
    <Dialog open>
      <DialogContent title="Delete this page?" description="This cannot be undone.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  ),
  "popover-open": () => (
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="secondary">Rename</Button>
      </PopoverTrigger>
      <PopoverContent label="Rename page">
        <Input label="Name" defaultValue="Home" />
      </PopoverContent>
    </Popover>
  ),
  "menu-open": () => (
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Page</DropdownMenuLabel>
        <DropdownMenuItem icon={<Copy />} shortcut="⌘D">
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Move to folder</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash2 />} destructive>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  "context-menu": () => (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="flex h-24 w-64 items-center justify-center rounded-card border border-dashed border-border-strong text-body text-foreground-muted">
          Right-click the canvas
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<Copy />} shortcut="⌘D">
          Duplicate
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  "command-palette": () => (
    <CommandPalette
      open
      onOpenChange={() => {}}
      onSelect={() => {}}
      items={[
        { id: "publish", label: "Publish page", group: "Commands", hint: "⌘⏎" },
        { id: "duplicate", label: "Duplicate page", group: "Commands", hint: "⌘D" },
        { id: "home", label: "Home", group: "Pages" },
      ]}
    />
  ),
  toast: () => (
    <ToastProvider>
      <RaiseToasts />
    </ToastProvider>
  ),
  "error-fallback": () => (
    <div className="w-96">
      <ErrorFallback
        scope="panel"
        error={Errors.infrastructure.unexpected(new Error("Cannot read properties of undefined"))}
        onReset={() => {}}
      />
    </div>
  ),
  tooltip: () => (
    <TooltipProvider delayDuration={0}>
      <Tooltip content="Undo" shortcut="⌘Z">
        <Button variant="ghost" aria-label="Undo">
          ↶
        </Button>
      </Tooltip>
    </TooltipProvider>
  ),
}

/** Raises one of each toast, so the stack can be photographed. */
function RaiseToasts() {
  const { show } = useToast()

  useEffect(() => {
    show({ title: "Page published", description: "It is live at example.com.", variant: "success" })
    show({
      title: "Publish failed",
      description: "The connection dropped.",
      variant: "danger",
      action: { label: "Retry", onAction: () => {} },
    })
  }, [show])

  return <p className="text-body text-foreground-muted">Toasts appear in the corner.</p>
}
