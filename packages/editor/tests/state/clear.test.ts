import { describe, expect, it } from "vitest"

import { nodeById } from "../../src/state/selectors"
import { makeStore } from "./support"

/**
 * Removing what a node holds, rather than overwriting it.
 *
 * ## Why a delete and not a write
 *
 * The inspector's per-property reset. Writing the component's default back
 * would look identical on screen and mean something else entirely: the node
 * would then hold that value itself, so a later change to the component's
 * default — or to the theme token it references — would stop reaching it.
 * docs/phases.md says what reset is for in four words: "restoring
 * inheritance". Only a delete does that.
 *
 * ## The base, where the inspector writes
 *
 * These clear the breakpoint and state the panel is editing, the same way
 * `setStyles` writes them. Per-breakpoint overrides are step 6 and will need
 * their own reset, which removes an override and restores the base rather
 * than removing the base itself.
 */

describe("clearing props", () => {
  it("removes the key rather than setting it to undefined", () => {
    /*
     * The distinction a `setProps(key, undefined)` would blur: a key present
     * and holding undefined still answers `in`, still survives a spread, and
     * still reads as a value the node has chosen.
     */
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello", level: 3 })
    store.getState().clearProps("heading", ["text"])

    const props = nodeById(state(), "heading")?.props ?? {}

    expect("text" in props).toBe(false)
    expect(props["level"]).toBe(3)
  })

  it("clears several at once", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello", level: 3 })
    store.getState().clearProps("heading", ["text", "level"])

    expect(nodeById(state(), "heading")?.props).toEqual({})
  })

  it("is unbothered by a key the node never held", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    store.getState().clearProps("heading", ["nothingLikeThis"])

    expect(nodeById(state(), "heading")?.props["text"]).toBe("Hello")
  })
})

describe("clearing styles", () => {
  it("removes the key from the breakpoint and state being edited", () => {
    const { store, state } = makeStore()

    store.getState().setStyles(["heading"], { color: "red", fontSize: "20px" })
    store.getState().clearStyles(["heading"], ["color"])

    const styles = nodeById(state(), "heading")?.styles.desktop?.base ?? {}

    expect("color" in styles).toBe(false)
    expect(styles["fontSize"]).toBe("20px")
  })

  it("clears the same keys across several nodes", () => {
    const { store, state } = makeStore()

    store.getState().setStyles(["heading", "text"], { color: "red" })
    store.getState().clearStyles(["heading", "text"], ["color"])

    for (const id of ["heading", "text"]) {
      expect("color" in (nodeById(state(), id)?.styles.desktop?.base ?? {})).toBe(false)
    }
  })

  it("leaves another breakpoint's value alone", () => {
    /*
     * A reset at desktop is a reset of the base. A tablet override is a
     * separate value with a separate reset, and clearing one from under the
     * other would silently undo work at a breakpoint nobody was looking at.
     */
    const { store, state } = makeStore()

    store.getState().setStyles(["heading"], { color: "red" })
    store.getState().setStyles(["heading"], { color: "blue" }, { breakpoint: "tablet" })
    store.getState().clearStyles(["heading"], ["color"])

    const styles = nodeById(state(), "heading")?.styles

    expect("color" in (styles?.desktop?.base ?? {})).toBe(false)
    expect(styles?.tablet?.base?.["color"]).toBe("blue")
  })

  it("writes nothing for a breakpoint the node never had", () => {
    /*
     * The quiet version of this bug: falling back to an empty bag and omitting
     * from that would add `mobile: { base: {} }` to the node, so every reset
     * at a breakpoint it never had would leave a little rubble in the
     * document — and a saved page would grow one of these per reset.
     */
    const { store, state } = makeStore()

    store.getState().setStyles(["heading"], { color: "red" })
    store.getState().clearStyles(["heading"], ["color"], { breakpoint: "mobile" })

    const styles = nodeById(state(), "heading")?.styles

    expect(styles?.mobile).toBeUndefined()
    expect(styles?.desktop?.base?.["color"]).toBe("red")
  })

  it("can be undone, restoring what was removed", () => {
    const { store, state } = makeStore()

    store.getState().setStyles(["heading"], { color: "red" })
    store.getState().clearStyles(["heading"], ["color"])
    store.getState().undo()

    expect(nodeById(state(), "heading")?.styles.desktop?.base?.["color"]).toBe("red")
  })

  it("does not fold two resets into one undo step", () => {
    /*
     * `setStyles` groups by node and breakpoint so that holding an arrow key
     * is one undo entry rather than forty. A reset is not that: it is one
     * deliberate act, and grouping two would hand back a property nobody
     * asked to get back.
     */
    const { store, state } = makeStore()

    store.getState().setStyles(["heading"], { color: "red", fontSize: "20px" })
    store.getState().clearStyles(["heading"], ["color"])
    store.getState().clearStyles(["heading"], ["fontSize"])
    store.getState().undo()

    const styles = nodeById(state(), "heading")?.styles.desktop?.base ?? {}

    expect(styles["fontSize"]).toBe("20px")
    expect("color" in styles).toBe(false)
  })
})
