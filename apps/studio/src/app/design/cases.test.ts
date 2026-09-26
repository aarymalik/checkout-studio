import { describe, expect, it } from "vitest"
import * as library from "@checkout-studio/ui"
import { CASES } from "./cases"
import { RENDERERS } from "./renderers"

/**
 * A component with no gallery case is a component nothing is watching.
 *
 * The visual suite iterates over CASES, so this is what makes the matrix
 * complete: adding a component to the library and forgetting to show it here
 * fails a test rather than quietly going unphotographed.
 */
const COMPONENT = /^[A-Z]/

/** Exports that are not components, and so have nothing to photograph. */
const NOT_A_COMPONENT = new Set(["PALETTE_MODES"])

describe("the gallery", () => {
  it("covers every component the library exports", () => {
    const exported = Object.keys(library).filter(
      (name) => COMPONENT.test(name) && !NOT_A_COMPONENT.has(name),
    )
    const covered = new Set(CASES.flatMap((testCase) => testCase.covers))

    expect(exported.filter((name) => !covered.has(name))).toEqual([])
  })

  it("names only components that exist", () => {
    // A case claiming to cover something that was renamed or removed would
    // report coverage nobody has.
    const exported = new Set(Object.keys(library))
    const claimed = [...new Set(CASES.flatMap((testCase) => testCase.covers))]

    expect(claimed.filter((name) => !exported.has(name))).toEqual([])
  })

  it("gives every case a distinct id, because the id names its screenshot", () => {
    const ids = CASES.map((testCase) => testCase.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("has a renderer for every case, and a case for every renderer", () => {
    // The two halves are separate modules — data for the server, rendering for
    // the browser — so nothing but this keeps them in step.
    const ids = CASES.map((testCase) => testCase.id).sort()

    expect(Object.keys(RENDERERS).sort()).toEqual(ids)
  })
})
