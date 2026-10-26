import type { CheckoutTheme } from "@checkout-studio/schema"

/**
 * What every Theme panel section is given.
 *
 * The theme and a way to replace it, passed in rather than read from context.
 * The panel checks once whether a theme exists at all, so a section never has
 * to; and a section handed its values is a section a test can render on its
 * own, without a provider around it.
 *
 * Each section writes its own group with one spread of its own. A shared
 * helper generic over the group key would need a cast to put the group back —
 * `{ ...theme, [key]: … }` loses the type — and one typed line per section is
 * worth more than one untyped line for all of them.
 */
export interface SectionProps {
  theme: CheckoutTheme
  update: (next: CheckoutTheme) => void
}
