import { describe, expect, it } from "vitest"
import { z } from "zod"

import { resolveSlot } from "../src/styles/slot"

const box = {
  label: "Box",
  schema: z.object({ background: z.string(), width: z.number() }),
  defaults: { background: "#ffffff", width: 320 },
}

describe("a component's theme slot, against the schema its plugin registered", () => {
  it("hands the plugin its own defaults when the theme sets nothing", () => {
    const resolved = resolveSlot(box, undefined)

    expect(resolved.values).toEqual({ background: "#ffffff", width: 320 })
    expect(resolved.problems).toEqual([])
  })

  it("lets the theme's values win over the plugin's defaults", () => {
    const resolved = resolveSlot(box, { background: "#000000" })

    expect(resolved.values).toEqual({ background: "#000000", width: 320 })
    expect(resolved.problems).toEqual([])
  })

  it("restores a refused key to the plugin's default", () => {
    const resolved = resolveSlot(box, { background: { r: 0 }, width: 480 })

    // The good value survives. Only what the schema refused falls back — a
    // merchant who got one value wrong keeps the rest of their decisions.
    expect(resolved.values).toEqual({ background: "#ffffff", width: 480 })
  })

  it("says which key it refused and what was written there", () => {
    const [problem, ...rest] = resolveSlot(box, { background: { r: 0 } }).problems

    expect(rest).toEqual([])
    expect(problem?.key).toBe("background")
    expect(problem?.value).toBe('{"r":0}')
    expect(problem?.reason).not.toBe("")
  })

  it("drops a refused key the plugin declares no default for", () => {
    const partial = { ...box, defaults: { width: 320 } }
    const resolved = resolveSlot(partial, { background: 12 })

    expect(resolved.values).toEqual({ width: 320 })
    expect(resolved.problems.map((problem) => problem.key)).toEqual(["background"])
  })

  it("loses the whole key when the failure is nested inside it", () => {
    const nested = {
      label: "Button",
      schema: z.object({ variants: z.object({ primary: z.object({ background: z.string() }) }) }),
      defaults: { variants: { primary: { background: "#ffffff" } } },
    }

    const resolved = resolveSlot(nested, { variants: { primary: { background: 0 } } })

    // Not a default spliced into the middle of a structure the plugin
    // designed: `toStyles` is only ever handed a shape its own schema accepts.
    expect(resolved.values).toEqual({ variants: { primary: { background: "#ffffff" } } })
    expect(resolved.problems.map((problem) => problem.key)).toEqual(["variants"])
  })

  it("reports one problem per key, however many issues it raised", () => {
    const pair = {
      label: "Pair",
      schema: z.object({ box: z.object({ a: z.string(), b: z.string() }) }),
      defaults: { box: { a: "1", b: "2" } },
    }

    const resolved = resolveSlot(pair, { box: { a: 1, b: 2 } })

    expect(resolved.problems).toHaveLength(1)
    expect(resolved.problems[0]?.key).toBe("box")
  })

  it("falls back to every default when the schema refuses the slot as a whole", () => {
    const paired = {
      ...box,
      schema: box.schema.refine((value) => value.width > 0 || value.background === "", {
        message: "A box with no width needs no background.",
      }),
    }

    const resolved = resolveSlot(paired, { width: -1 })

    // A rule written across keys names none of them, so there is no key to
    // restore and the slot falls back entire.
    expect(resolved.values).toEqual({ background: "#ffffff", width: 320 })
    expect(resolved.problems.map((problem) => problem.key)).toEqual([""])
  })

  it("falls back to defaults when the plugin's own defaults fail its own schema", () => {
    const wrong = { ...box, defaults: { background: 0, width: 320 } }
    const resolved = resolveSlot(wrong, { background: 1 })

    expect(resolved.values).toEqual({ background: 0, width: 320 })
    expect(resolved.problems).not.toEqual([])
  })

  it("keeps a key the slot schema does not declare", () => {
    // The schema is a gate, not a transform: a non-strict slot schema strips
    // its undeclared keys on parse, and a plugin reading one would lose it.
    const resolved = resolveSlot(box, { shadow: "0 1px 2px #0000001a" })

    expect(resolved.values["shadow"]).toBe("0 1px 2px #0000001a")
    expect(resolved.problems).toEqual([])
  })

  it("does not let a schema default rewrite what the theme wrote", () => {
    const defaulted = {
      label: "Box",
      schema: z.object({ background: z.string().default("#eeeeee") }),
      defaults: { background: "#ffffff" },
    }

    expect(resolveSlot(defaulted, { background: "#123456" }).values).toEqual({
      background: "#123456",
    })
  })

  it("does not let a coercion rewrite what the theme wrote", () => {
    const coercing = {
      label: "Box",
      schema: z.object({ width: z.coerce.number() }),
      defaults: { width: 320 },
    }

    // Zod would turn "480" into 480. The plugin asked for a number and gets
    // the string the merchant actually stored, because changing it is not
    // validation's job — and the plugin's schema said the string was fine.
    expect(resolveSlot(coercing, { width: "480" }).values).toEqual({ width: "480" })
  })

  it("quotes a refused string as the merchant wrote it", () => {
    // Not through JSON.stringify, which would double-quote it inside the
    // warning the renderer already wraps in quotes.
    const resolved = resolveSlot(box, { width: "480px" })

    expect(resolved.problems[0]?.value).toBe("480px")
  })

  it("says so when a key the schema requires is set nowhere", () => {
    const widthless = { ...box, defaults: { background: "#ffffff" } }
    const [problem] = resolveSlot(widthless, {}).problems

    expect(problem?.key).toBe("width")
    expect(problem?.value).toBe("nothing")
  })

  it("describes a default that is not JSON at all", () => {
    // A plugin's defaults are TypeScript, so nothing stops one holding a
    // function. It is a plugin bug, and a readable warning beats a render that
    // dies formatting the message about it.
    const odd = { ...box, defaults: { background: () => "#ffffff", width: 320 } }
    const [problem] = resolveSlot(odd, {}).problems

    expect(problem?.key).toBe("background")
    expect(problem?.value).toContain("=>")
  })

  it("describes a value it cannot serialise rather than throwing out of a render", () => {
    const circular: Record<string, unknown> = {}
    circular["self"] = circular

    const resolved = resolveSlot(box, { background: circular })

    expect(resolved.problems).toHaveLength(1)
    expect(resolved.values["background"]).toBe("#ffffff")
  })
})
