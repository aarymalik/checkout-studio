import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/*
 * The sheet without its prose.
 *
 * The comments discuss `@layer` at length, so an assertion about the CSS has
 * to be made against the CSS.
 */
const reset = readFileSync(fileURLToPath(new URL("../src/css/reset.css", import.meta.url)), "utf8")
  .replaceAll(/\/\*[\s\S]*?\*\//g, "")
  .trim()

/** Every rule in the sheet, as a selector and the declarations inside it. */
function rules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] as string).trim(),
    body: (match[2] as string).trim(),
  }))
}

/**
 * The focus ring, read as text.
 *
 * It cannot be read any other way here: the thing these assertions protect is
 * a transition, and the screenshots that photograph the ring run with
 * animations disabled, which fast-forwards every transition to its end. The
 * only moment that matters — the first frame — is the one no picture holds.
 */
describe("the focus ring", () => {
  it("is drawn by an unlayered rule, so no utility can remove it", () => {
    // Twenty-three controls carry `outline-none` and not one provides a ring
    // of its own. Inside a layer this rule loses to all of them.
    expect(reset).not.toMatch(/@layer/)
    expect(rules(reset).map(({ selector }) => selector)).toContain(":focus-visible")
  })

  it("has its colour declared on everything, not only on what is focused", () => {
    /*
     * `transition-colors` animates `outline-color`. If focus is the thing that
     * sets the colour, the ring spends its first 150ms at the inherited
     * `currentColor` — white on a primary button, on a white page, so there is
     * no ring at all for exactly as long as the transition runs.
     */
    const unconditional = rules(reset).find(({ selector }) => selector === ":where(*)")

    expect(unconditional?.body).toBe("outline-color: var(--cs-color-focus-ring);")
  })

  it("takes its colour from the token every theme rebinds", () => {
    const focused = rules(reset).find(({ selector }) => selector === ":focus-visible")

    expect(focused?.body).toMatch(/outline:[^;]*var\(--cs-color-focus-ring\)/)
  })
})
