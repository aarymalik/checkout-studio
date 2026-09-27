import { cn } from "@checkout-studio/ui"
import { BRAND, GLYPH } from "./colors"

/**
 * The Checkout Studio mark.
 *
 * Lives in the application rather than in @checkout-studio/ui. The component
 * library is the generic half — it is meant to outlive this product and carry
 * the next one — and a brand in it would be the first thing to pull back out.
 *
 * The checkmark is two offset planes rather than one rounded stroke. A rounded
 * tick is a checkbox, and a checkbox is what a task manager uses; the seam and
 * the sharp corners are what make this read as something built rather than
 * something ticked.
 *
 * The tile keeps its colour in both themes, which is why it is the one place in
 * the product with a literal value in it: a brand that changes with the
 * operating system is not a brand. The size comes from tokens like everything
 * else.
 */
export function Logo({
  className,
  title = "Checkout Studio",
}: {
  className?: string
  title?: string
}) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label={title} className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill={BRAND} />
      <path d="M7 15 L12.5 20.5 L10 23 L4.5 17.5 Z" fill={GLYPH} fillOpacity="0.5" />
      <path d="M24.5 8.5 L27 11 L13.5 24.5 L11 22 Z" fill={GLYPH} />
    </svg>
  )
}

/** The mark beside the name. For a header, or the top of a sign-in card. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Logo className="size-8" />
      <span className="text-h4 font-semibold tracking-tight text-foreground">Checkout Studio</span>
    </span>
  )
}
