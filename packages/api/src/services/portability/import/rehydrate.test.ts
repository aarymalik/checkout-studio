import { describe, expect, it } from "vitest"
import { contentHash } from "@checkout-studio/utils"
import type { StoredAsset, TenantContext } from "@checkout-studio/database"

import { recordingStore } from "../../assets/store"
import { rehydrateAssets } from "./rehydrate"
import type { RehydrationInput } from "./rehydrate"
import type { AssetRegistryEntry } from "../export/registry"

/** The fetcher without its optional half, which `exactOptionalPropertyTypes` minds. */
type Fetcher = NonNullable<RehydrationInput["fetch"]>
import type { FetchResult } from "./fetch"

/**
 * Bringing a bundle's files into this project.
 *
 * Two things this must not do, and they are what most of these are about:
 * fetch a file the project already has, and let a file in by a door the
 * upload form does not use.
 */

/** A one-pixel PNG, so the sanitizer has something real to accept. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

const PNG_HASH = contentHash(PNG)

const tenant: TenantContext = { userId: "usr_one", projectId: "prj_one" }

function entry(over: Partial<AssetRegistryEntry> = {}): AssetRegistryEntry {
  return {
    sourceId: "ast_hero",
    url: "https://cdn.example.test/hero.png",
    fileName: "hero.png",
    mimeType: "image/png",
    bytes: PNG.length,
    sha256: PNG_HASH,
    referencedBy: ["copy"],
    ...over,
  }
}

function held(sha256: string): StoredAsset {
  return {
    id: "ast_existing",
    fileName: "already-here.png",
    mimeType: "image/png",
    sizeBytes: 2_048,
    width: 1,
    height: 1,
    folder: null,
    storageKey: `assets/${sha256}.png`,
    url: `https://cdn.test/assets/${sha256}.png`,
    sha256,
    renditions: [],
    createdAt: new Date("2026-11-15T00:00:00.000Z"),
  }
}

const serving = (bytes: Uint8Array) => async (): Promise<FetchResult> => ({
  ok: true,
  asset: { bytes, contentType: "image/png" },
})

const refusing =
  (reason: "blocked-address" | "hash-mismatch") => async (): Promise<FetchResult> => ({
    ok: false,
    reason,
    message: "no",
  })

function input(over: Partial<RehydrationInput> = {}): RehydrationInput {
  return {
    tenant,
    entries: [entry()],
    held: [],
    store: recordingStore(),
    limits: { maxBytes: 1_000_000, timeoutMs: 1_000 },
    fetch: serving(PNG) as Fetcher,
    ...over,
  }
}

describe("a file the project already holds", () => {
  it("is never fetched", async () => {
    /*
     * The declared hash is what says so. Fetching to find out would spend a
     * network round trip to learn what the registry already said.
     */
    const never = (): never => {
      throw new Error("Nothing should have been fetched.")
    }

    const result = await rehydrateAssets(input({ held: [held(PNG_HASH)], fetch: never as Fetcher }))

    expect(result.ok ? result.rehydrated.reused : 0).toBe(1)
    expect(result.ok ? result.rehydrated.bytesTransferred : -1).toBe(0)
  })

  it("points the descriptor at the row that holds it", async () => {
    const result = await rehydrateAssets(input({ held: [held(PNG_HASH)] }))

    expect(result.ok ? result.rehydrated.assets[0] : null).toMatchObject({
      sourceId: "ast_hero",
      sha256: PNG_HASH,
      fileName: "already-here.png",
    })
  })

  it("writes nothing to storage", async () => {
    const store = recordingStore()

    await rehydrateAssets(input({ held: [held(PNG_HASH)], store }))

    expect(store.objects.size).toBe(0)
  })
})

describe("a file the project does not hold", () => {
  it("goes through the same door an upload does", async () => {
    /*
     * The one that matters. A second path into the asset library that did
     * less sanitizing would not be a shortcut; it would be the supported
     * way of getting a script onto a checkout page.
     */
    const store = recordingStore()
    const result = await rehydrateAssets(input({ store }))

    expect(result.ok).toBe(true)
    expect(store.objects.size).toBe(1)
    expect(result.ok ? result.rehydrated.uploaded : 0).toBe(1)
  })

  it("records the hash of what was stored, not of what arrived", async () => {
    /*
     * The sanitizer re-encodes, so the two can differ. The row has to
     * describe the bytes that are actually there, or nothing downstream can
     * find them.
     */
    const store = recordingStore()
    const result = await rehydrateAssets(input({ store }))
    const descriptor = result.ok ? result.rehydrated.assets[0] : null
    const written = [...store.objects.values()][0]

    expect(descriptor?.sha256).toBe(contentHash(written?.bytes ?? new Uint8Array()))
    expect(descriptor?.storageKey).toBe(written?.key)
  })

  it("counts the bytes that crossed a network, not the ones it was promised", async () => {
    /*
     * The registry's `bytes` is a claim by whoever made the bundle. What
     * went over the wire is what actually arrived, and a figure somebody
     * reads as "how much did this cost" should be the second.
     */
    const result = await rehydrateAssets(input({ entries: [entry({ bytes: 9_999_999 })] }))

    expect(result.ok ? result.rehydrated.bytesTransferred : 0).toBe(PNG.length)
  })
})

describe("what stops an import", () => {
  it("a registry entry that says where nothing is", async () => {
    const result = await rehydrateAssets(input({ entries: [entry({ url: undefined })] }))

    expect(result).toMatchObject({ ok: false, reason: "no-source", sourceId: "ast_hero" })
  })

  it("a fetch that was refused, naming the file", async () => {
    const result = await rehydrateAssets(input({ fetch: refusing("blocked-address") as Fetcher }))

    expect(result).toMatchObject({ ok: false, reason: "unfetchable" })
    expect(result.ok === false ? result.message : "").toContain("hero.png")
  })

  it("bytes that are not what the bundle described", async () => {
    expect(
      await rehydrateAssets(input({ fetch: refusing("hash-mismatch") as Fetcher })),
    ).toMatchObject({ ok: false, reason: "unfetchable" })
  })

  it("a file this product does not accept", async () => {
    const script = new TextEncoder().encode("#!/bin/sh\necho hello")
    const result = await rehydrateAssets(input({ fetch: serving(script) as Fetcher }))

    expect(result).toMatchObject({ ok: false, reason: "unacceptable" })
    expect(result.ok === false ? result.message : "").toContain("hero.png")
  })
})

describe("with no fetcher given", () => {
  it("uses the real one", async () => {
    /*
     * The default is the production path, and the only way to know it is
     * wired is to let it run. `example.test` is a reserved name that
     * resolves nowhere, so this reaches the real fetcher and comes back
     * from it without touching anything.
     */
    const { fetch: _unused, ...withoutFetcher } = input()
    const result = await rehydrateAssets(withoutFetcher)

    expect(result).toMatchObject({ ok: false, reason: "unfetchable" })
  })
})

describe("several files at once", () => {
  it("are counted apart", async () => {
    const result = await rehydrateAssets(
      input({
        entries: [entry(), entry({ sourceId: "ast_old", sha256: "b".repeat(64) })],
        held: [held("b".repeat(64))],
      }),
    )

    expect(result.ok ? result.rehydrated : null).toMatchObject({ uploaded: 1, reused: 1 })
  })

  it("are nothing at all for a page that names none", async () => {
    expect(await rehydrateAssets(input({ entries: [] }))).toEqual({
      ok: true,
      rehydrated: { assets: [], uploaded: 0, reused: 0, bytesTransferred: 0 },
    })
  })
})
