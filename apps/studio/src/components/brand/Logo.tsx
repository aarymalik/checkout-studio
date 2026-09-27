import { cn } from "@checkout-studio/ui"
import { BRAND, GLYPH } from "./colors"

/**
 * The Checkout Studio mark.
 *
 * Lives in the application rather than in @checkout-studio/ui. The component
 * library is the generic half — it is meant to outlive this product and carry
 * the next one — and a brand in it would be the first thing to pull back out.
 *
 * A payment card, in three rectangles. The stripe is the tile colour showing
 * through rather than a third value, so the whole mark is two colours and holds
 * together at any size.
 *
 * Solid rather than knocked out of the tile: a mark cut as a hole takes the
 * colour of whatever sits behind it, which in a browser tab is a different
 * colour on every machine.
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
      <rect x="6" y="10" width="20" height="13" rx="2.5" fill={GLYPH} />
      <rect x="6" y="13.2" width="20" height="3.4" fill={BRAND} />
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
