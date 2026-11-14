import { describe, expect, it } from "vitest"
import type { StoredAsset } from "@checkout-studio/database"

import { analyzeImport } from "./analyze"
import type { AnalysisInput } from "./analyze"
import type { Compatibility } from "./compatibility"
import type { AssetRegistryEntry } from "../export/registry"
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from "../types"
import type { BundleManifest } from "../types"

/**
 * The screen somebody approves before anything happens.
 *
 * "Users must be able to see exactly what an import will do before it
 * happens" is the requirement the spec opens that section with, so these are
 * mostly about completeness and honesty: that nothing is done, that nothing
 * surprising is left out, and that a number nobody can act on is not
 * presented as one they can.
 */

function manifest(over: Partial<BundleManifest["contents"]> = {}): BundleManifest {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    kind: "page",
    bundleId: "bnd_one",
    name: "Checkout",
    tags: [],
    createdAt: "2026-11-14T09:00:00.000Z",
    createdBy: { name: "Spring Sale Ltd" },
    generator: { product: "checkout-studio", version: "0.1.0" },
    requires: {
      schemaVersion: "1.0.0",
      rendererVersion: "^0.1.0",
      plugins: [],
      fonts: [],
      componentTypes: [],
    },
    contents: {
      pages: ["Checkout"],
      symbols: [],
      sections: [],
      theme: true,
      settings: false,
      assets: 0,
      totalNodes: 12,
      uncompressedBytes: 4_096,
      ...over,
    },
    checksum: "unused here",
  }
}

const COMPATIBLE: Compatibility = { ok: true, migrate: null, warnings: [] }

function arriving(fileName: string, sha256: string, bytes = 2_048): AssetRegistryEntry {
  return {
    sourceId: `ast_source_${sha256}`,
    fileName,
    mimeType: "image/png",
    bytes,
    sha256: sha256.padEnd(64, "0"),
    referencedBy: ["hero"],
  }
}

function held(fileName: string, sha256: string): StoredAsset {
  return {
    id: `ast_${sha256}`,
    fileName,
    mimeType: "image/png",
    sizeBytes: 2_048,
    width: null,
    height: null,
    folder: null,
    storageKey: `assets/${sha256}.png`,
    url: `https://cdn.test/assets/${sha256}.png`,
    sha256: sha256.padEnd(64, "0"),
    renditions: [],
    createdAt: new Date("2026-11-14T00:00:00.000Z"),
  }
}

function input(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    manifest: manifest(),
    assets: [],
    page: { name: "Checkout", slug: "checkout" },
    target: { projectId: "prj_target", mode: "into-project" },
    project: { assets: [], slugsInUse: [] },
    compatibility: COMPATIBLE,
    themeStrategy: "keep-target",
    ...over,
  }
}

describe("a plan for a bundle that will import cleanly", () => {
  it("says what it will create and carries the manifest it was made from", () => {
    const plan = analyzeImport(input())

    expect(plan.actions).toEqual([{ type: "create-page", name: "Checkout" }])
    expect(plan.bundle.bundleId).toBe("bnd_one")
    expect(plan.target).toEqual({ projectId: "prj_target", mode: "into-project" })
    expect(plan.blockers).toEqual([])
  })

  it("puts the migration first, because everything else depends on it", () => {
    const migrating: Compatibility = {
      ok: true,
      migrate: { from: "1.0.0", to: "1.2.0" },
      warnings: [],
    }

    expect(analyzeImport(input({ compatibility: migrating })).actions[0]).toEqual({
      type: "migrate-schema",
      from: "1.0.0",
      to: "1.2.0",
    })
  })

  it("counts what the bundle says it holds", () => {
    const plan = analyzeImport(input({ manifest: manifest({ assets: 3, totalNodes: 40 }) }))

    expect(plan.estimate).toMatchObject({ pages: 1, nodes: 40, assets: 3 })
  })
})

describe("a plan that cannot be carried out", () => {
  it("carries the blocker and nothing else", () => {
    /*
     * Listing work that cannot happen would describe an import nobody can
     * have, and a duration beside it would be for something that will never
     * run.
     */
    const blocked: Compatibility = {
      ok: false,
      reason: "schema-too-new",
      required: "2.0.0",
      supported: "1.2.0",
    }
    const plan = analyzeImport(
      input({ compatibility: blocked, assets: [arriving("a.png", "aaa")] }),
    )

    expect(plan.actions).toEqual([])
    expect(plan.conflicts).toEqual([])
    expect(plan.estimate).toEqual({ pages: 0, nodes: 0, assets: 0, assetBytes: 0, durationMs: 0 })
  })

  it("tells the person what to do about it", () => {
    // A blocker without a remediation is a dead end.
    const blocked: Compatibility = {
      ok: false,
      reason: "schema-too-new",
      required: "2.0.0",
      supported: "1.2.0",
    }

    expect(analyzeImport(input({ compatibility: blocked })).blockers).toEqual([
      {
        code: "schema-too-new",
        message:
          "This bundle was made with a newer version of Checkout Studio (schema 2.0.0; this one reads 1.2.0).",
        remediation: "Update Checkout Studio, then import it again.",
      },
    ])
  })
})

describe("the theme", () => {
  it("is not applied by default, and that is said rather than discovered", () => {
    /*
     * `keep-target` is right for a page arriving in an existing project — it
     * adopts the project's theme and looks like it belongs. A bundle whose
     * own theme is silently discarded is precisely what the spec means by
     * something that will degrade quietly.
     */
    const plan = analyzeImport(input())

    expect(plan.actions.some((action) => action.type === "merge-theme")).toBe(false)
    expect(plan.warnings).toEqual([
      {
        code: "theme-not-applied",
        message:
          "This bundle carries a theme. It will be ignored, and the pages will use this project's theme.",
      },
    ])
  })

  it("says nothing when the bundle has no theme to ignore", () => {
    expect(analyzeImport(input({ manifest: manifest({ theme: false }) })).warnings).toEqual([])
  })

  it("is an action under any other strategy", () => {
    const plan = analyzeImport(input({ themeStrategy: "namespace" }))

    expect(plan.actions).toContainEqual({ type: "merge-theme", strategy: "namespace" })
    expect(plan.warnings).toEqual([])
  })
})

describe("what the estimate counts", () => {
  it("is the bytes that cross a network, not the bytes in the bundle", () => {
    /*
     * A reused asset is a row pointing at bytes already here. Counting it
     * would inflate a number somebody is reading as "how long will this
     * take".
     */
    const plan = analyzeImport(
      input({
        assets: [arriving("new.png", "bbb", 10_000), arriving("old.png", "aaa", 50_000)],
        project: { assets: [held("old.png", "aaa")], slugsInUse: [] },
      }),
    )

    expect(plan.estimate.assetBytes).toBe(10_000)
  })

  it("is nothing to transfer for a page with no new files", () => {
    expect(analyzeImport(input()).estimate.assetBytes).toBe(0)
  })

  it("grows with the bytes and never shrinks below the fixed cost", () => {
    // Not a measurement — the constants are named guesses until an import has
    // been timed. What it has to get right is the ordering.
    const small = analyzeImport(input({ assets: [arriving("a.png", "bbb", 1_000)] }))
    const large = analyzeImport(input({ assets: [arriving("b.png", "ccc", 5_000_000)] }))

    expect(small.estimate.durationMs).toBeGreaterThan(0)
    expect(large.estimate.durationMs).toBeGreaterThan(small.estimate.durationMs)
  })
})

describe("what the compatibility gate found", () => {
  it("arrives as words for the person deciding", () => {
    const warned: Compatibility = {
      ok: true,
      migrate: null,
      warnings: [
        { code: "plugin-missing", id: "checkout", required: "^0.1.0", optional: false },
        { code: "renderer-unsatisfied", required: "^0.2.0", installed: "0.1.4" },
      ],
    }
    const plan = analyzeImport(
      input({ compatibility: warned, manifest: manifest({ theme: false }) }),
    )

    expect(plan.warnings).toEqual([
      {
        code: "plugin-missing",
        message:
          "The plugin checkout is not installed. Its components will not render until it is.",
      },
      {
        code: "renderer-unsatisfied",
        message:
          "This bundle expects renderer ^0.2.0; this one is 0.1.4. Parts of the page may not render as they did.",
      },
    ])
  })

  it("distinguishes an optional plugin, which costs less", () => {
    const warned: Compatibility = {
      ok: true,
      migrate: null,
      warnings: [{ code: "plugin-missing", id: "marketing", required: "^0.1.0", optional: true }],
    }
    const plan = analyzeImport(
      input({ compatibility: warned, manifest: manifest({ theme: false }) }),
    )

    expect(plan.warnings[0]?.message).toContain("will be left out")
  })

  it.each([
    ["renderer-unreadable", { code: "renderer-unreadable", required: "1.x" } as const],
    [
      "plugin-unsatisfied",
      {
        code: "plugin-unsatisfied",
        id: "core-layout",
        required: "^0.2.0",
        installed: "0.1.4",
      } as const,
    ],
    [
      "plugin-unreadable",
      { code: "plugin-unreadable", id: "core-layout", required: "1.x" } as const,
    ],
  ])("is described rather than passed through: %s", (code, warning) => {
    const warned: Compatibility = { ok: true, migrate: null, warnings: [warning] }
    const plan = analyzeImport(
      input({ compatibility: warned, manifest: manifest({ theme: false }) }),
    )

    expect(plan.warnings[0]?.code).toBe(code)
    expect(plan.warnings[0]?.message.length).toBeGreaterThan(20)
  })
})

describe("what needs deciding", () => {
  it("is every conflict the project raises, from both sources", () => {
    const plan = analyzeImport(
      input({
        assets: [arriving("hero.png", "bbb")],
        project: { assets: [held("hero.png", "aaa")], slugsInUse: ["checkout"] },
      }),
    )

    expect(plan.conflicts.map((conflict) => conflict.kind)).toEqual([
      "duplicate-page-slug",
      "asset-name-collision",
    ])
  })

  it("does not stop the plan, because a conflict is a decision", () => {
    const plan = analyzeImport(input({ project: { assets: [], slugsInUse: ["checkout"] } }))

    expect(plan.actions).toContainEqual({ type: "create-page", name: "Checkout" })
    expect(plan.blockers).toEqual([])
  })
})
