import { cn } from "@checkout-studio/ui"
import { BRAND, BRAND_ACCENT, GLYPH } from "./colors"

/**
 * The Checkout Studio mark.
 *
 * Lives in the application rather than in @checkout-studio/ui. The component
 * library is the generic half — it is meant to outlive this product and carry
 * the next one — and a brand in it would be the first thing to pull back out.
 *
 * A payment card, in three shapes. The stripe is the tile showing through the
 * card rather than a third colour, so the gradient runs continuously behind
 * both and the whole mark is two values.
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
const GRADIENT_ID = "cs-brand"

export function Logo({
  className,
  title = "Checkout Studio",
}: {
  className?: string
  title?: string
}) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label={title} className={cn("size-8", className)}>
      {/*
        One id, shared by every instance on a page. Two identical definitions
        under one name resolve to the same gradient, and generating a unique id
        per instance would make this a client component for no benefit.
      */}
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BRAND} />
          <stop offset="1" stopColor={BRAND_ACCENT} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${GRADIENT_ID})`} />
      <rect x="6" y="10" width="20" height="13" rx="2.5" fill={GLYPH} />
      <rect x="6" y="13.2" width="20" height="3.4" fill={`url(#${GRADIENT_ID})`} />
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
