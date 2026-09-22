import { describe, expect, it } from "vitest"
import { LAYERS, FORBIDDEN, allowedDependencies, layerOf, reasonFor } from "../layers.js"

/**
 * These tests encode docs/monorepo-structure.md. If the architecture changes,
 * they fail — which is the point.
 */
describe("layer model", () => {
  it("places every package in exactly one layer", () => {
    const all = LAYERS.flat()
    expect(new Set(all).size).toBe(all.length)
  })

  it("lets the editor depend on the renderer", () => {
    expect(allowedDependencies("editor")).toContain("renderer")
  })

  it("never lets the renderer depend on the editor", () => {
    expect(allowedDependencies("renderer")).not.toContain("editor")
  })

  it("keeps Studio UI and the database out of the renderer", () => {
    const allowed = allowedDependencies("renderer")
    expect(allowed).not.toContain("ui")
    expect(allowed).not.toContain("design-system")
    expect(allowed).not.toContain("database")
    expect(allowed).not.toContain("api")
  })

  it("keeps the schema package pure", () => {
    expect(allowedDependencies("schema")).toEqual(["config", "types", "utils"])
  })

  it("keeps server packages out of the editor", () => {
    const allowed = allowedDependencies("editor")
    expect(allowed).not.toContain("database")
    expect(allowed).not.toContain("api")
  })

  it("forbids lateral imports within a layer", () => {
    for (const [index, members] of LAYERS.entries()) {
      if (members.length < 2) continue
      for (const member of members) {
        const allowed = allowedDependencies(member)
        for (const sibling of members) {
          if (sibling !== member) expect(allowed).not.toContain(sibling)
        }
      }
      expect(index).toBeGreaterThanOrEqual(0)
    }
  })

  it("only ever allows strictly lower layers", () => {
    for (const members of LAYERS) {
      for (const member of members) {
        const from = layerOf(member)
        for (const dependency of allowedDependencies(member)) {
          expect(layerOf(dependency)).toBeLessThan(from)
        }
      }
    }
  })

  it("keeps plugins away from the editor and the server", () => {
    const allowed = allowedDependencies("*", { kind: "plugin" })
    for (const forbidden of FORBIDDEN.plugin.packages) {
      expect(allowed).not.toContain(forbidden)
    }
    expect(allowed).toContain("plugin-sdk")
    expect(allowed).toContain("renderer")
  })

  it("lets applications depend on everything", () => {
    expect(allowedDependencies("studio", { kind: "app" })).toEqual(LAYERS.flat())
  })

  it("explains why an edge is refused", () => {
    expect(reasonFor("renderer", "editor")).toMatch(/never depend on builder code/)
    expect(reasonFor("api", "editor")).toMatch(/same layer/)
    expect(reasonFor("schema", "renderer")).toMatch(/pure/)
  })

  it("rejects an unknown package rather than guessing", () => {
    expect(() => allowedDependencies("nope")).toThrow(/Unknown workspace package/)
    expect(layerOf("nope")).toBeNull()
  })
})
