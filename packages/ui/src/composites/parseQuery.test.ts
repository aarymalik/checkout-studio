import { describe, expect, it } from "vitest"
import { parseQuery } from "./parseQuery"

/**
 * The mode prefixes are specified in docs/keyboard-shortcuts.md § Command
 * Palette. They are the difference between a palette and a search box.
 */
describe("parseQuery", () => {
  it("searches everything when there is no prefix", () => {
    expect(parseQuery("publish")).toEqual({ mode: "everything", query: "publish" })
  })

  it.each([
    [">", "commands"],
    ["#", "pages"],
    ["@", "components"],
    [":", "nodes"],
  ] as const)("reads %s as %s", (prefix, mode) => {
    expect(parseQuery(`${prefix}checkout`)).toEqual({ mode, query: "checkout" })
  })

  it("treats a bare prefix as everything of that kind", () => {
    // Typing ">" alone means "show me the commands", not "find a command
    // called nothing".
    expect(parseQuery(">")).toEqual({ mode: "commands", query: "" })
  })

  it("trims the space people type after a prefix", () => {
    expect(parseQuery("> publish ")).toEqual({ mode: "commands", query: "publish" })
  })

  it("leaves a prefix in the middle alone", () => {
    expect(parseQuery("page #2")).toEqual({ mode: "everything", query: "page #2" })
  })

  it("reads an empty input as everything", () => {
    expect(parseQuery("")).toEqual({ mode: "everything", query: "" })
  })
})
