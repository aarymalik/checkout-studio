import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Where Tailwind is told to look.
 *
 * A class used only in a package missing from this list produces no CSS at
 * all. Nothing fails: not the build, not the types, not a test — the component
 * renders as unstyled markup and the first anyone knows is looking at it.
 *
 * That is what happened to the inspector's four-side spacing control.
 * `grid-cols-4` appears nowhere in this application or in `ui`, so the four
 * boxes stacked down the panel at full width. Adding the editor's source to
 * the globs put the rule in the stylesheet; removing it again took the rule
 * straight back out, which is how the diagnosis was checked rather than
 * assumed.
 *
 * This is a reminder rather than a proof. Proving it needs a build and a grep
 * of the output, which is what `pnpm build` plus the check above was for.
 */
const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "globals.css"), "utf8")

/** Every package whose source reaches this application's screen. */
const CONTRIBUTORS = ["packages/ui/src", "packages/editor/src"]

describe("the studio's stylesheet", () => {
  it("scans its own source", () => {
    expect(CSS).toContain('@source "../../src"')
  })

  it.each(CONTRIBUTORS)("scans %s, whose classes it renders", (source) => {
    expect(CSS).toContain(source)
  })
})
