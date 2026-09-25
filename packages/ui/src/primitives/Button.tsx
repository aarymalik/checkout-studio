import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"
import { Spinner } from "../feedback/Spinner"
import { cn } from "../lib/cn"

/**
 * The Button.
 *
 * Five variants, because the interface needs exactly five answers to "how much
 * does this action matter": primary, secondary, ghost, outline and danger.
 * Adding a sixth is a design decision, not a props change.
 *
 * Every value here is a token. See docs/design-system.md § Buttons.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none",
    "rounded-control",
    // Motion communicates the state change and nothing else. The duration
    // token collapses to zero when the reader asks for reduced motion.
    "transition-colors duration-fast ease-standard",
    // The ring comes from the reset, so every focusable thing in the product
    // agrees. :focus-visible, so a pointer user is not shown a ring they did
    // not ask for.
    "outline-none",
    // A disabled button still reads, it just does not respond.
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover active:bg-primary-active",
        secondary:
          "bg-surface text-foreground border border-border-strong hover:bg-surface-hover active:bg-surface-active",
        ghost: "text-foreground hover:bg-surface-hover active:bg-surface-active",
        outline:
          "border border-border-strong text-foreground hover:bg-surface-hover active:bg-surface-active",
        danger:
          "bg-danger text-danger-foreground shadow-card hover:bg-danger-hover active:bg-danger-active",
      },
      size: {
        sm: "h-control-sm px-3 text-small",
        md: "h-control-md px-4 text-body",
        lg: "h-control-lg px-6 text-body-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
)

interface ButtonBaseProps extends ComponentPropsWithRef<"button">, VariantProps<typeof button> {}

/**
 * `asChild` and `loading` are mutually exclusive, and the types say so.
 *
 * Radix's Slot renders exactly one child, and a loading button renders two — a
 * spinner beside the label. Allowing both would be a runtime crash in the one
 * state a developer is least likely to click through. A link cannot be busy in
 * any case: it navigates, and the page it navigates to owns the wait.
 */
export type ButtonProps = ButtonBaseProps &
  (
    | {
        /**
         * Waiting on something.
         *
         * Disables the button and announces the wait. The label stays visible —
         * replacing it with a spinner alone loses the only description of what
         * is happening, and makes the button change width mid-click.
         */
        loading?: boolean
        asChild?: false
      }
    | {
        /**
         * Renders the child element instead of a `button`, keeping the styling.
         *
         * For a link that looks like a button. A link that looks like a button
         * must still be a link, or it will not open in a new tab and will not
         * appear in a screen reader's list of links.
         */
        asChild: true
        loading?: never
      }
  )

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button"

  /*
   * One child when not loading, deliberately.
   *
   * `{loading ? <Spinner /> : null}{children}` reads the same and is not: a
   * null still occupies a child slot, so Slot's React.Children.only sees two
   * children and throws on every asChild button.
   */
  const content = loading ? (
    <>
      <Spinner size={size === "lg" ? "md" : "sm"} label="Working" />
      {children}
    </>
  ) : (
    children
  )

  return (
    <Component
      className={cn(button({ variant, size }), className)}
      // A loading button is not available, and says why rather than only
      // looking unavailable.
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </Component>
  )
}

export { button as buttonVariants }
