import { randomBytes } from "node:crypto"

import { redis, whenReady } from "@checkout-studio/cache"
import { assetRepository, prisma } from "@checkout-studio/database"
import type { TenantContext } from "@checkout-studio/database"
import { AppError, contentHash } from "@checkout-studio/utils"
import sharp from "sharp"
import type { Sharp } from "sharp"
import { beforeEach, describe, expect, it } from "vitest"

import { invalidateEntitlements } from "../../src/services/billing/entitlements"
import { recordingStore } from "../../src/services/assets/store"
import { storeUpload, uploadRefusalError } from "../../src/services/assets/upload"
import type { UploadResult } from "../../src/services/assets/upload"

/**
 * An upload, from bytes to a row.
 *
 * Against the real database, the real entitlement cache and a store that keeps
 * what it is given. What these are about is the order of the pipeline — which
 * is the only thing this module adds — and the things that order is for: that
 * a re-upload costs nothing, that a plan's ceiling counts renditions, that
 * nothing is recorded that was not written, and that an SVG never reaches
 * libvips.
 */

let counter = 0

async function aTenant(planId?: "free" | "starter"): Promise<TenantContext & { userId: string }> {
  counter += 1
  const suffix = `${Date.now()}-${counter}`

  const user = await prisma.user.create({
    data: {
      email: `u-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })

  if (planId !== undefined) {
    await prisma.subscription.create({ data: { userId: user.id, planId } })
  }

  await invalidateEntitlements(user.id)

  const project = await prisma.project.create({
    data: { userId: user.id, name: "Project", slug: `p-${suffix}` },
  })

  return { userId: user.id, projectId: project.id }
}

/** Gradients plus grain, so a lossy encoder has something to work at. */
function picture(width: number, height: number): Sharp {
  const pixels = Buffer.alloc(width * height * 3)
  const grain = randomBytes(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3
      const speck = ((grain[y * width + x] ?? 0) - 128) * 0.12

      pixels[at] = clamp(120 + 100 * Math.sin(x / 90) + speck)
      pixels[at + 1] = clamp(110 + 90 * Math.cos(y / 70) + speck)
      pixels[at + 2] = clamp(140 + 80 * Math.sin((x + y) / 110) + speck)
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

async function photo(width = 1200, height = 400): Promise<Uint8Array> {
  return new Uint8Array(await picture(width, height).jpeg({ quality: 90 }).toBuffer())
}

const LOGO = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>',
)

/** `wOF2`, and then enough bytes to be a file. Nothing here decodes a font. */
const FONT = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 0x11, 0x22])

/*
 * Scoped to the tenant. This suite does not truncate between tests — each one
 * makes its own user — so a count of every row would count the neighbours'.
 */
async function rowsFor(tenant: TenantContext): Promise<number> {
  return prisma.asset.count({ where: { project: { userId: tenant.userId } } })
}

function stored(result: UploadResult) {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)

  return result
}

beforeEach(async () => {
  await whenReady()
  await redis.flushdb()
})

describe("a photograph", () => {
  it("is stored, derived from and recorded", async () => {
    const tenant = await aTenant()
    const store = recordingStore()

    const { asset, deduplicated } = stored(
      await storeUpload({ tenant, store, bytes: await photo(), fileName: "hero.jpg" }),
    )

    expect(deduplicated).toBe(false)
    expect(asset.mimeType).toBe("image/jpeg")
    expect([asset.width, asset.height]).toEqual([1200, 400])
    expect(asset.renditions.map((one) => `${one.size}/${one.format}`)).toEqual([
      "thumbnail/webp",
      "thumbnail/avif",
      "medium/webp",
      "medium/avif",
    ])
  })

  it("is not the bytes that arrived", async () => {
    // The master is what the encoder wrote, and the hash is of that, so the
    // row describes the file that exists.
    const tenant = await aTenant()
    const store = recordingStore()
    const bytes = await photo()

    const { asset } = stored(await storeUpload({ tenant, store, bytes, fileName: "hero.jpg" }))

    expect(asset.sha256).not.toBe(contentHash(bytes))
    expect(asset.sizeBytes).not.toBe(bytes.length)
  })

  it("puts every file it recorded and records every file it put", async () => {
    const tenant = await aTenant()
    const store = recordingStore()

    const { asset } = stored(
      await storeUpload({ tenant, store, bytes: await photo(), fileName: "hero.jpg" }),
    )

    expect(store.objects.size).toBe(1 + asset.renditions.length)
    expect(store.objects.has(asset.storageKey)).toBe(true)

    for (const rendition of asset.renditions) {
      const key = `assets/${asset.sha256}/${rendition.size}-${rendition.width}.${rendition.format}`
      const put = store.objects.get(key)

      expect(put).toBeDefined()
      expect(put?.bytes.length).toBe(rendition.sizeBytes)
      expect(put?.contentType).toBe(`image/${rendition.format}`)
    }
  })

  it("is served from where the store says, not from the bucket's own host", async () => {
    const tenant = await aTenant()
    const store = recordingStore("https://cdn.example.test")

    const { asset } = stored(
      await storeUpload({ tenant, store, bytes: await photo(), fileName: "hero.jpg" }),
    )

    expect(asset.url).toBe(`https://cdn.example.test/${asset.storageKey}`)
  })
})

describe("the same picture twice", () => {
  it("costs nothing the second time", async () => {
    /*
     * The reason the lookup is here at all. The second upload derives no
     * renditions, writes no object and charges no quota — it is the row that
     * is already there.
     */
    const tenant = await aTenant()
    const store = recordingStore()
    const bytes = await photo()

    const first = stored(await storeUpload({ tenant, store, bytes, fileName: "hero.jpg" }))
    const written = store.objects.size

    store.objects.clear()

    const again = stored(await storeUpload({ tenant, store, bytes, fileName: "hero-copy.jpg" }))

    expect(written).toBeGreaterThan(1)
    expect(again.deduplicated).toBe(true)
    expect(again.asset.id).toBe(first.asset.id)
    expect(store.objects.size).toBe(0)
    expect(await rowsFor(tenant)).toBe(1)
  })

  it("is one row even when the two files differ only in metadata", async () => {
    const tenant = await aTenant()
    const store = recordingStore()
    const base = picture(600, 200)
    const one = new Uint8Array(
      await base
        .clone()
        .withExif({ IFD0: { Make: "Acme" } })
        .jpeg({ quality: 90 })
        .toBuffer(),
    )
    const two = new Uint8Array(
      await base
        .clone()
        .withExif({ IFD3: { GPSLatitudeRef: "N" } })
        .jpeg({ quality: 90 })
        .toBuffer(),
    )

    expect(contentHash(one)).not.toBe(contentHash(two))

    const first = stored(await storeUpload({ tenant, store, bytes: one, fileName: "a.jpg" }))
    const second = stored(await storeUpload({ tenant, store, bytes: two, fileName: "b.jpg" }))

    expect(second.deduplicated).toBe(true)
    expect(second.asset.id).toBe(first.asset.id)
  })
})

describe("a type nothing here decodes", () => {
  it("is stored with no renditions and no dimensions", async () => {
    const tenant = await aTenant()
    const store = recordingStore()

    const { asset } = stored(
      await storeUpload({ tenant, store, bytes: FONT, fileName: "brand.woff2" }),
    )

    expect(asset.mimeType).toBe("font/woff2")
    expect(asset.renditions).toEqual([])
    expect([asset.width, asset.height]).toEqual([null, null])
    expect(store.objects.size).toBe(1)
  })
})

describe("a drawing", () => {
  it("is sanitized, stored, and never handed to libvips", async () => {
    /*
     * The property this is really about. An SVG is already every size, so
     * there is nothing to derive — and deriving would rasterize it through the
     * librsvg named in the `sharp` override, which is the one path the asset
     * pipeline is arranged so as never to reach. One object, no renditions.
     */
    const tenant = await aTenant()
    const store = recordingStore()
    const hostile = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<script>alert(1)</script><path d="M4 4h16v16H4z"/></svg>',
    )

    const { asset } = stored(
      await storeUpload({ tenant, store, bytes: hostile, fileName: "logo.svg" }),
    )

    expect(asset.mimeType).toBe("image/svg+xml")
    expect(asset.renditions).toEqual([])
    expect(store.objects.size).toBe(1)

    const put = store.objects.get(asset.storageKey)
    const markup = new TextDecoder().decode(put?.bytes ?? new Uint8Array())

    expect(markup).not.toContain("script")
  })

  it("deduplicates against the clean version of itself", async () => {
    const tenant = await aTenant()
    const store = recordingStore()
    const hostile = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<script>alert(1)</script><path d="M4 4h16v16H4z"/></svg>',
    )

    const clean = stored(await storeUpload({ tenant, store, bytes: LOGO, fileName: "logo.svg" }))
    const scrubbed = stored(
      await storeUpload({ tenant, store, bytes: hostile, fileName: "logo.svg" }),
    )

    expect(scrubbed.asset.id).toBe(clean.asset.id)
    expect(scrubbed.deduplicated).toBe(true)
  })
})

describe("a file that cannot be stored", () => {
  it("comes back as a refusal, with nothing written", async () => {
    const tenant = await aTenant()
    const store = recordingStore()
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02])

    const result = await storeUpload({ tenant, store, bytes: elf, fileName: "a.png" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unrecognised")
    expect(store.objects.size).toBe(0)
    expect(await rowsFor(tenant)).toBe(0)
  })

  it("is refused before anything is derived from it", async () => {
    const tenant = await aTenant()
    const store = recordingStore()
    const corrupt = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

    const result = await storeUpload({ tenant, store, bytes: corrupt, fileName: "p.jpg" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unreadable")
    expect(store.objects.size).toBe(0)
  })

  it("refuses a name that is a path, before reading the bytes as anything", async () => {
    const tenant = await aTenant()
    const store = recordingStore()

    const result = await storeUpload({
      tenant,
      store,
      bytes: await photo(),
      fileName: "../../hero.jpg",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unsafe-name")
  })
})

describe("the ceilings a caller may tighten", () => {
  it("passes a size limit down to the boundary", async () => {
    const tenant = await aTenant()
    const store = recordingStore()

    const result = await storeUpload({
      tenant,
      store,
      bytes: await photo(),
      fileName: "hero.jpg",
      limits: { image: 1_000 },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
    expect(result.limit).toBe(1_000)
    expect(store.objects.size).toBe(0)
  })

  it("passes a pixel ceiling down to the decoder", async () => {
    const tenant = await aTenant()
    const store = recordingStore()

    const result = await storeUpload({
      tenant,
      store,
      bytes: await photo(1200, 400),
      fileName: "hero.jpg",
      maxPixels: 1_000,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-many-pixels")
    expect(store.objects.size).toBe(0)
  })
})

describe("the plan's ceiling", () => {
  it("counts what is held already, across every project", async () => {
    const tenant = await aTenant("free")
    const other = await prisma.project.create({
      data: { userId: tenant.userId, name: "Other", slug: `o-${Date.now()}` },
    })

    // The free plan allows 100 MB. Most of it is already spoken for, in a
    // different project of the same person's.
    await assetRepository.create(
      { userId: tenant.userId, projectId: other.id },
      {
        fileName: "old.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 99_990_000,
        storageKey: "assets/old.jpg",
        url: "https://assets.test/assets/old.jpg",
        sha256: "a".repeat(64),
        renditions: [],
      },
    )

    const failure = await storeUpload({
      tenant,
      store: recordingStore(),
      bytes: await photo(),
      fileName: "hero.jpg",
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AppError)
    expect((failure as AppError).code).toBe("QUOTA_EXCEEDED")
    expect(await rowsFor(tenant)).toBe(1)
  })

  it("counts the renditions, not only the master", async () => {
    /*
     * The second check, after deriving. A master that fits on its own and does
     * not fit once its renditions exist is refused — and refused before a byte
     * is written, so a plan's ceiling is never briefly exceeded.
     */
    const tenant = await aTenant("free")
    const store = recordingStore()
    const bytes = await photo(1600, 500)

    const measured = stored(await storeUpload({ tenant, store, bytes, fileName: "hero.jpg" }))
    const renditionBytes = measured.asset.renditions.reduce((sum, one) => sum + one.sizeBytes, 0)

    await prisma.asset.deleteMany({ where: { project: { userId: tenant.userId } } })

    const other = await prisma.project.create({
      data: { userId: tenant.userId, name: "Other", slug: `o2-${Date.now()}` },
    })

    // Leaves room for the master and not for what is derived from it.
    await assetRepository.create(
      { userId: tenant.userId, projectId: other.id },
      {
        fileName: "old.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100_000_000 - measured.asset.sizeBytes - Math.floor(renditionBytes / 2),
        storageKey: "assets/old.jpg",
        url: "https://assets.test/assets/old.jpg",
        sha256: "b".repeat(64),
        renditions: [],
      },
    )

    const fresh = recordingStore()
    const failure = await storeUpload({
      tenant,
      store: fresh,
      bytes,
      fileName: "hero.jpg",
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AppError)
    expect((failure as AppError).code).toBe("QUOTA_EXCEEDED")
    expect(fresh.objects.size).toBe(0)
  })

  it("does not charge for bytes that are already there", async () => {
    // A re-upload writes nothing, so it cannot be the thing that puts an
    // account over its limit.
    const tenant = await aTenant("free")
    const store = recordingStore()
    const bytes = await photo(600, 200)

    const first = stored(await storeUpload({ tenant, store, bytes, fileName: "hero.jpg" }))

    await prisma.asset.update({
      where: { id: first.asset.id },
      data: { sizeBytes: 100_000_000 },
    })

    const again = stored(await storeUpload({ tenant, store, bytes, fileName: "hero.jpg" }))

    expect(again.deduplicated).toBe(true)
  })
})

describe("what a refused upload is told", () => {
  it("names the ceiling and not a size nobody sent", async () => {
    /*
     * For a re-encoded image the refused size is the stored file's, which is
     * not the size that arrived. Reporting the ceiling and one byte past it
     * says the true thing without inventing the other.
     */
    const error = uploadRefusalError({ ok: false, reason: "too-large", limit: 10_000_000 })

    expect(error.code).toBe("FILE_TOO_LARGE")
    expect(error.status).toBe(422)
    expect(error.userMessage).toContain("10 MB")
  })

  it("falls back to the ceiling's own words when no limit came with it", async () => {
    const error = uploadRefusalError({ ok: false, reason: "too-large" })

    expect(error.code).toBe("UPLOAD_REJECTED")
  })

  it("says what the merchant can change", async () => {
    const cases = [
      ["empty", "No file was sent."],
      ["unrecognised", "That file type isn't supported."],
      ["unsafe-name", "That file name can't be used. Try renaming the file."],
      ["unreadable", "That image couldn't be read. Try exporting it again."],
      ["too-many-pixels", "That image is too large to process. Try a smaller version."],
    ] as const

    for (const [reason, sentence] of cases) {
      expect(uploadRefusalError({ ok: false, reason }).userMessage).toBe(sentence)
    }
  })

  it("gives every sanitizer refusal one sentence, and keeps the reason for the log", async () => {
    /*
     * A DOCTYPE, a CDATA section and an unknown entity are all true and none
     * of them is useful to whoever exported the drawing. The reason is in the
     * error's context, which is what a log reads.
     */
    const reasons = ["doctype", "cdata", "entity", "malformed", "too-complex"] as const

    for (const reason of reasons) {
      const error = uploadRefusalError({ ok: false, reason })

      expect(error.userMessage).toBe("That drawing couldn't be made safe to publish.")
      expect(error.context).toMatchObject({ reason })
    }
  })

  it("is something a merchant can act on, every time", async () => {
    // No refusal may fall through to a blank or a developer's phrasing.
    const every = [
      "empty",
      "unrecognised",
      "too-large",
      "unsafe-name",
      "needs-sanitizing",
      "not-text",
      "not-svg",
      "doctype",
      "cdata",
      "processing-instruction",
      "entity",
      "malformed",
      "too-complex",
      "unreadable",
      "too-many-pixels",
    ] as const

    for (const reason of every) {
      const message = uploadRefusalError({ ok: false, reason }).userMessage

      expect(message).toMatch(/^[A-Z].*\.$/)
      expect(message).not.toContain(reason)
    }
  })
})
