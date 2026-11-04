import type { AssetReference } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import type { ControlValue } from "../../src/inspector"

/**
 * What a control may write.
 *
 * Asserted at the type level, because that is where it is enforced: there is
 * no control writing a reference yet, and the point of widening first is that
 * the one that does can be written without also changing four signatures in
 * the same commit.
 *
 * ## What actually fails when this breaks
 *
 * `tsc`, not vitest. Vitest strips the types and the assertions below pass
 * against any union at all — narrowing `ControlValue` back to the scalars, or
 * widening it to `unknown`, leaves this file green and the typecheck task red
 * by two errors and three.
 *
 * That is worth stating because it is easy to read these as runtime tests and
 * trust them for something they do not do. The gate runs `typecheck` beside
 * `test`, so the contract is enforced — just not here.
 */

type Admits<T> = T extends ControlValue ? true : false

describe("the value a control writes", () => {
  it("admits the scalars every other control writes", () => {
    const string: Admits<string> = true
    const number: Admits<number> = true
    const boolean: Admits<boolean> = true
    const nothing: Admits<null> = true

    expect([string, number, boolean, nothing]).toEqual([true, true, true, true])
  })

  it("admits an asset reference, which is an object", () => {
    /*
     * The reason this type exists. A reference is how a document names an
     * asset — the renderer resolves `{ "$asset": "ast_9f2a" }` to URLs before
     * a component sees anything — so the value a control stores and the value
     * a component receives are deliberately different shapes.
     */
    const reference: Admits<AssetReference> = true

    expect(reference).toBe(true)
  })

  it("admits no other object, so the type still says which", () => {
    // Not `PropValue`, which also admits arrays and arbitrary objects. A
    // control writes one property's value.
    const array: Admits<readonly string[]> = false
    const object: Admits<{ src: string }> = false
    const variable: Admits<{ $var: string }> = false

    expect([array, object, variable]).toEqual([false, false, false])
  })

  it("is assignable from a reference built at runtime", () => {
    // The shape a picker will produce, checked as a value and not only as a
    // type: an excess property would compile as a type and fail here.
    const chosen: ControlValue = { $asset: "ast_9f2a" }

    expect(chosen).toEqual({ $asset: "ast_9f2a" })
  })
})
