import { describe, expect, it } from "vitest"

import { isCompatible, pluginId, pluginManifest } from "../src/manifest"
import { ENGINE, manifest } from "./support"

describe("the plugin manifest", () => {
  it("parses a complete manifest", () => {
    expect(manifest().id).toBe("core")
  })

  it("defaults the permission list to empty", () => {
    expect(manifest().permissions).toEqual([])
  })

  it("requires a kebab-case id, because the id is a component namespace", () => {
    expect(pluginId.safeParse("core").success).toBe(true)
    expect(pluginId.safeParse("core-forms").success).toBe(true)
    expect(pluginId.safeParse("Core").success).toBe(false)
    expect(pluginId.safeParse("core_forms").success).toBe(false)
    expect(pluginId.safeParse("1core").success).toBe(false)
  })

  it("rejects an unknown key", () => {
    const parsed = pluginManifest.safeParse({ ...manifest(), homepage: "https://example.com" })

    expect(parsed.success).toBe(false)
  })

  it("rejects a version that is not major.minor.patch", () => {
    expect(pluginManifest.safeParse({ ...manifest(), version: "1.0" }).success).toBe(false)
  })

  it("rejects an unknown permission", () => {
    const parsed = pluginManifest.safeParse({ ...manifest(), permissions: ["everything"] })

    expect(parsed.success).toBe(false)
  })
})

describe("compatibility", () => {
  it("accepts a plugin built for this engine", () => {
    expect(isCompatible(manifest(), ENGINE)).toEqual({ compatible: true })
  })

  it("refuses a plugin that needs a newer engine", () => {
    const result = isCompatible(
      manifest({ compatibility: { minEngineVersion: "2.0.0", schemaVersion: "1.0.0" } }),
      ENGINE,
    )

    expect(result.compatible).toBe(false)
    if (result.compatible) return
    expect(result.reason).toBe("engine-too-old")
    expect(result.message).toContain("2.0.0 or newer")
  })

  it("refuses a plugin never tested against this engine", () => {
    const result = isCompatible(
      manifest({
        compatibility: {
          minEngineVersion: "0.9.0",
          maxEngineVersion: "0.9.9",
          schemaVersion: "1.0.0",
        },
      }),
      ENGINE,
    )

    expect(result.compatible).toBe(false)
    if (result.compatible) return
    expect(result.reason).toBe("engine-too-new")
  })

  it("accepts a plugin at either end of its own range", () => {
    const bounded = manifest({
      compatibility: {
        minEngineVersion: "1.0.0",
        maxEngineVersion: "2.0.0",
        schemaVersion: "1.0.0",
      },
    })

    expect(isCompatible(bounded, { engine: "1.0.0", schema: "1.0.0" }).compatible).toBe(true)
    expect(isCompatible(bounded, { engine: "2.0.0", schema: "1.0.0" }).compatible).toBe(true)
  })

  it("refuses a plugin written against a different major schema version", () => {
    const result = isCompatible(
      manifest({ compatibility: { minEngineVersion: "1.0.0", schemaVersion: "2.0.0" } }),
      ENGINE,
    )

    expect(result.compatible).toBe(false)
    if (result.compatible) return
    expect(result.reason).toBe("schema-mismatch")
  })

  it("accepts a plugin written against an earlier minor schema version", () => {
    // Migrations within a major version are additive by construction, so a
    // plugin authored against 1.0.0 still understands a 1.4.0 document.
    const result = isCompatible(
      manifest({ compatibility: { minEngineVersion: "1.0.0", schemaVersion: "1.0.0" } }),
      { engine: "1.0.0", schema: "1.4.0" },
    )

    expect(result.compatible).toBe(true)
  })
})
