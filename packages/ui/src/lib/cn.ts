import { clsx } from "clsx"
import type { ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { staticSemantics } from "@checkout-studio/design-system"

/**
 * Composes class names, letting the caller win.
 *
 * `clsx` flattens conditionals; tailwind-merge resolves Tailwind conflicts by
 * keeping the last one. Both matter: every component accepts a `className`, and
 * a caller passing `bg-danger` to something whose base style says `bg-primary`
 * expects their colour, not two colours in source order.
 *
 * tailwind-merge classifies a class by matching it against Tailwind's own
 * scales, so it does not recognise ours: `rounded-control` and `rounded-card`
 * looked like unrelated classes and both survived, which is an override that
 * silently does nothing. The scales below teach it our names — read from the
 * token source rather than listed here, so a token added tomorrow is
 * understood without anyone remembering this file.
 */

/** The semantic names under one prefix: `radius-card` → `card`. */
function scale(prefix: string): string[] {
  return Object.keys(staticSemantics)
    .filter((token) => token.startsWith(prefix))
    .map((token) => token.slice(prefix.length))
}

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: scale("radius-"),
      text: scale("text-"),
      shadow: scale("shadow-"),
      font: scale("font-"),
      leading: scale("leading-"),
      ease: scale("easing-"),
    },
    classGroups: {
      // Control heights are a height, not a spacing step.
      h: scale("control-height-").map((size) => `h-control-${size}`),
      duration: scale("duration-").map((speed) => `duration-${speed}`),
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
