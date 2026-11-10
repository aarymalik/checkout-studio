import { describe, expect, it } from "vitest"

import { checksumOf } from "./checksum"
import { toJsonBundle } from "./export/serialize/json"
import { readJsonBundle } from "./import/integrity"
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from "./types"
import type { Bundle, BundleManifest, BundlePayload } from "./types"

/**
 * The envelope a bundle travels in.
 *
 * What is proved here is the round trip and the gate: the same thing exported
 * twice is the same bytes, and a file that is not what it says it is does not
 * get past the first stage. Both are Phase 15 exit criteria, and both are
 * about the format rather than about anything inside it — there are no
 * collectors yet, which is also why there is nothing here that could leak.
 */

const PAYLOAD: BundlePayload = {
  document: { version: "1.0.0", root: "root", nodes: { root: { id: "root" } } },
  theme: { id: "theme_default", name: "Default" },
}

function manifest(over: Partial<BundleManifest> = {}): BundleManifest {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    kind: "page",
    bundleId: "bnd_one",
    name: "Checkout",
    tags: [],
    createdAt: "2026-11-10T09:00:00.000Z",
    createdBy: { name: "Spring Sale Ltd" },
    generator: { product: "checkout-studio", version: "0.1.0" },
    requires: {
      schemaVersion: "1.0.0",
      rendererVersion: "^0.1.0",
      plugins: [],
      fonts: [],
      componentTypes: ["core.page"],
    },
    contents: {
      pages: ["pag_one"],
      symbols: [],
      sections: [],
      theme: true,
      settings: true,
      assets: 0,
      totalNodes: 1,
      uncompressedBytes: 120,
    },
    checksum: checksumOf(PAYLOAD),
    ...over,
  }
}

const bundle = (over: Partial<BundleManifest> = {}, payload: BundlePayload = PAYLOAD): Bundle => ({
  manifest: manifest(over),
  payload,
})

describe("the round trip", () => {
  it("reads back what was written", () => {
    const read = readJsonBundle(toJsonBundle(bundle()))

    expect(read.ok).toBe(true)
    expect(read.ok ? read.bundle.payload : null).toEqual(PAYLOAD)
  })

  it("writes the same bytes for the same bundle", () => {
    // Export → import → export is byte-identical, which is what lets "has
    // this changed?" be a string comparison rather than a diff somebody reads.
    const once = toJsonBundle(bundle())
    const read = readJsonBundle(once)

    expect(read.ok ? toJsonBundle(read.bundle) : "").toBe(once)
  })

  it("is not disturbed by the order an object was built in", () => {
    /*
     * Two exports of the same page that differ only in key order are the same
     * bundle. Without this the checksum changes when nothing did, and nothing
     * downstream can tell a re-export from an edit.
     */
    const forwards: BundlePayload = { document: { a: 1, b: 2 }, theme: { x: 1, y: 2 } }
    const backwards: BundlePayload = { theme: { y: 2, x: 1 }, document: { b: 2, a: 1 } }

    expect(checksumOf(backwards)).toBe(checksumOf(forwards))
    expect(toJsonBundle(bundle({ checksum: checksumOf(backwards) }, backwards))).toBe(
      toJsonBundle(bundle({ checksum: checksumOf(forwards) }, forwards)),
    )
  })
})

describe("what the first gate refuses", () => {
  it("a file that is not JSON", () => {
    expect(readJsonBundle("not json at all")).toMatchObject({ reason: "unreadable" })
  })

  it.each(["null", "42", '"a string"'])("JSON that is not even an object: %s", (text) => {
    // `JSON.parse` answers with whatever was in the file, and a file holding
    // `null` is valid JSON. Reaching for `.manifest` on it is the crash this
    // branch exists to not have.
    expect(readJsonBundle(text)).toMatchObject({ reason: "not-a-bundle" })
  })

  it("JSON that is not a bundle", () => {
    expect(readJsonBundle(JSON.stringify({ hello: "world" }))).toMatchObject({
      reason: "not-a-bundle",
    })
  })

  it("something else's file that happens to be JSON", () => {
    // A `format` of our own is how a bundle says it is ours. Reading one
    // without it would be reading a stranger's file hopefully.
    const foreign = { manifest: { formatVersion: "1.0.0" }, payload: {} }

    expect(readJsonBundle(JSON.stringify(foreign))).toMatchObject({ reason: "not-a-bundle" })
  })

  it("a bundle carrying nothing", () => {
    const empty = { manifest: manifest(), payload: null }

    expect(readJsonBundle(JSON.stringify(empty))).toMatchObject({ reason: "not-a-bundle" })
  })

  it("a payload that has been changed since it was written", () => {
    const tampered = { manifest: manifest(), payload: { ...PAYLOAD, theme: { id: "theirs" } } }

    expect(readJsonBundle(JSON.stringify(tampered))).toMatchObject({
      reason: "checksum-mismatch",
    })
  })

  it("a bundle from a newer product, rather than reading half of it", () => {
    /*
     * The envelope's version, not the schema's. A document written against an
     * older schema is migrated on import; an envelope this product cannot
     * read is refused, because the thing that would migrate it is the thing
     * that cannot read it.
     */
    const newer = readJsonBundle(toJsonBundle(bundle({ formatVersion: "2.0.0" })))

    expect(newer).toMatchObject({ reason: "unsupported-format" })
    expect("bundle" in newer).toBe(false)
  })

  it("an older envelope it can still read", () => {
    // Older is not a problem: this product knows what 1.x meant.
    expect(readJsonBundle(toJsonBundle(bundle({ formatVersion: "1.0.0" })))).toMatchObject({
      ok: true,
    })
  })

  it("a bundle that does not say which envelope it is", () => {
    // A file that cannot say what it is has not said it is readable.
    const vague = readJsonBundle(
      toJsonBundle(bundle({ formatVersion: undefined as unknown as string })),
    )

    expect(vague).toMatchObject({ reason: "unsupported-format" })
  })
})

describe("the checksum", () => {
  it("is of the payload and not of the manifest", () => {
    /*
     * It lives in the manifest, so hashing the manifest would mean hashing
     * everything except itself — a rule two implementations will eventually
     * disagree about. Renaming a bundle does not change what it carries.
     */
    const renamed = readJsonBundle(toJsonBundle(bundle({ name: "Something else" })))

    expect(renamed).toMatchObject({ ok: true })
  })
})
