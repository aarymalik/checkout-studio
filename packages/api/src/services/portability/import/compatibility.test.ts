import { describe, expect, it } from "vitest"

import { checkCompatibility } from "./compatibility"
import type { Installation } from "./compatibility"
import { satisfies } from "./versions"
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from "../types"
import type { BundleManifest, PluginRequirement } from "../types"

/**
 * Whether this installation can take a bundle.
 *
 * One refusal and three warnings, and the asymmetry is the whole design: a
 * document written against a newer schema cannot be read by the thing that
 * would migrate it, while everything else is a page that imports and renders
 * imperfectly. A merchant who can see what is missing is better served than
 * one handed a refusal.
 */

const HERE: Installation = {
  schemaVersion: "1.2.0",
  rendererVersion: "0.1.4",
  plugins: new Map([
    ["core-layout", "0.1.4"],
    ["core-content", "0.1.4"],
  ]),
}

function manifest(
  requires: Partial<BundleManifest["requires"]> = {},
  plugins: readonly PluginRequirement[] = [],
): BundleManifest {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    kind: "page",
    bundleId: "bnd_one",
    name: "Checkout",
    tags: [],
    createdAt: "2026-11-13T09:00:00.000Z",
    createdBy: { name: "Spring Sale Ltd" },
    generator: { product: "checkout-studio", version: "0.1.0" },
    requires: {
      schemaVersion: "1.2.0",
      rendererVersion: "^0.1.0",
      plugins: [...plugins],
      fonts: [],
      componentTypes: [],
      ...requires,
    },
    contents: {
      pages: ["Checkout"],
      symbols: [],
      sections: [],
      theme: true,
      settings: false,
      assets: 0,
      totalNodes: 1,
      uncompressedBytes: 120,
    },
    checksum: "unused here",
  }
}

const required = (over: Partial<PluginRequirement> = {}): PluginRequirement => ({
  id: "core-layout",
  version: "^0.1.0",
  optional: false,
  ...over,
})

describe("the schema a bundle was written against", () => {
  it("refuses one this build has never heard of", () => {
    /*
     * The only refusal, and it is absolute. Migrations run forwards, so the
     * thing that would bring the document up to date is the thing that cannot
     * read it.
     */
    expect(checkCompatibility(manifest({ schemaVersion: "2.0.0" }), HERE)).toEqual({
      ok: false,
      reason: "schema-too-new",
      required: "2.0.0",
      supported: "1.2.0",
    })
  })

  it("queues a migration for an older one", () => {
    expect(checkCompatibility(manifest({ schemaVersion: "1.0.0" }), HERE)).toMatchObject({
      ok: true,
      migrate: { from: "1.0.0", to: "1.2.0" },
    })
  })

  it("needs no migration for the current one", () => {
    expect(checkCompatibility(manifest(), HERE)).toMatchObject({ ok: true, migrate: null })
  })

  it("reports the migration rather than running it", () => {
    // A gate that migrated would be a gate nobody could ask what would happen
    // if they imported this.
    const result = checkCompatibility(manifest({ schemaVersion: "1.0.0" }), HERE)

    expect(result.ok && "document" in result).toBe(false)
  })
})

describe("the renderer the bundle asks for", () => {
  it("passes quietly when this one satisfies it", () => {
    expect(checkCompatibility(manifest(), HERE)).toMatchObject({ warnings: [] })
  })

  it("warns rather than refusing when it does not", () => {
    // The page imports and some of it renders. Refusing would leave somebody
    // with a file and nothing to do with it.
    const result = checkCompatibility(manifest({ rendererVersion: "^0.2.0" }), HERE)

    expect(result).toMatchObject({ ok: true })
    expect(result.ok ? result.warnings : []).toEqual([
      { code: "renderer-unsatisfied", required: "^0.2.0", installed: "0.1.4" },
    ])
  })

  it("says so when the range is not one it can read", () => {
    /*
     * A bundle from somebody else's implementation of the format. Reading it
     * as satisfied installs something that may not render; reading it as a
     * refusal rejects a bundle that is probably fine.
     */
    const result = checkCompatibility(manifest({ rendererVersion: ">=0.1.0 <0.3.0" }), HERE)

    expect(result.ok ? result.warnings : []).toEqual([
      { code: "renderer-unreadable", required: ">=0.1.0 <0.3.0" },
    ])
  })
})

describe("the plugins the bundle needs", () => {
  it("say nothing when they are all installed and new enough", () => {
    const result = checkCompatibility(
      manifest({}, [required(), required({ id: "core-content" })]),
      HERE,
    )

    expect(result.ok ? result.warnings : []).toEqual([])
  })

  it("report one that is not installed at all", () => {
    const result = checkCompatibility(manifest({}, [required({ id: "checkout" })]), HERE)

    expect(result.ok ? result.warnings : []).toEqual([
      { code: "plugin-missing", id: "checkout", required: "^0.1.0", optional: false },
    ])
  })

  it("carry whether it was optional, so an interface can rank them", () => {
    const result = checkCompatibility(
      manifest({}, [required({ id: "marketing", optional: true })]),
      HERE,
    )

    expect(result.ok ? result.warnings : []).toMatchObject([{ optional: true }])
  })

  it("report one that is installed but too old", () => {
    const result = checkCompatibility(manifest({}, [required({ version: "^0.1.9" })]), HERE)

    expect(result.ok ? result.warnings : []).toEqual([
      { code: "plugin-unsatisfied", id: "core-layout", required: "^0.1.9", installed: "0.1.4" },
    ])
  })

  it("report a range they cannot read", () => {
    const result = checkCompatibility(manifest({}, [required({ version: "1.x" })]), HERE)

    expect(result.ok ? result.warnings : []).toEqual([
      { code: "plugin-unreadable", id: "core-layout", required: "1.x" },
    ])
  })

  it("report every one of them, not the first", () => {
    // One per attempt would mean one plugin installed per attempt.
    const result = checkCompatibility(
      manifest({}, [required({ id: "checkout" }), required({ id: "marketing" })]),
      HERE,
    )

    expect(result.ok ? result.warnings : []).toHaveLength(2)
  })

  it("are reported beside a renderer that is also wrong", () => {
    const result = checkCompatibility(
      manifest({ rendererVersion: "^0.2.0" }, [required({ id: "checkout" })]),
      HERE,
    )

    expect(result.ok ? result.warnings.map((entry) => entry.code) : []).toEqual([
      "renderer-unsatisfied",
      "plugin-missing",
    ])
  })
})

describe("a caret range", () => {
  it.each([
    ["1.2.3", "^1.2.3", "satisfied"],
    ["1.9.9", "^1.2.3", "satisfied"],
    ["2.0.0", "^1.2.3", "unsatisfied"],
    ["1.2.2", "^1.2.3", "unsatisfied"],
  ])(
    "above 1.0.0 allows anything below the next major: %s against %s",
    (version, range, verdict) => {
      expect(satisfies(version, range)).toBe(verdict)
    },
  )

  it.each([
    ["0.1.2", "^0.1.2", "satisfied"],
    ["0.1.9", "^0.1.2", "satisfied"],
    ["0.2.0", "^0.1.2", "unsatisfied"],
    ["0.1.1", "^0.1.2", "unsatisfied"],
  ])("below 1.0.0 stops at the next minor: %s against %s", (version, range, verdict) => {
    /*
     * npm's rule, and the one the exporter wrote the caret with. While this
     * product is pre-1.0 the strictness is the point: a minor version is
     * where everything still moves.
     */
    expect(satisfies(version, range)).toBe(verdict)
  })

  it.each([
    ["0.0.3", "^0.0.3", "satisfied"],
    ["0.0.4", "^0.0.3", "unsatisfied"],
  ])("below 0.1.0 allows only itself: %s against %s", (version, range, verdict) => {
    expect(satisfies(version, range)).toBe(verdict)
  })
})

describe("a range that is not a caret", () => {
  it("matches an exact version exactly", () => {
    expect(satisfies("1.2.3", "1.2.3")).toBe("satisfied")
    expect(satisfies("1.2.4", "1.2.3")).toBe("unsatisfied")
  })

  it.each([">=1.0.0", "1.x", "~1.2.3", "*", ""])("is unreadable: %s", (range) => {
    // Not a semver library, deliberately: the whole surface is a caret and an
    // exact version, and nothing in this product emits anything else.
    expect(satisfies("1.2.3", range)).toBe("unreadable")
  })

  it("is unreadable when the installed version is not a version", () => {
    expect(satisfies("next", "^1.0.0")).toBe("unreadable")
  })
})
