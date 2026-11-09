import { randomUUID } from "node:crypto"

import { prisma } from "@checkout-studio/database"
import { createDocument, defaultTheme, serialize } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

/**
 * A published checkout, created directly.
 *
 * Through the database rather than through the publish flow, because publishing
 * arrives in Phase 15 and these tests are about rendering. The rows are the ones
 * publishing will write, so the route is exercised exactly as it will be in
 * production.
 */

/** The fixture's mobile padding, so a test can assert it without restating it. */
export const MOBILE_PADDING = 8

export interface Published {
  userId: string
  hostname: string
  slug: string
  pageId: string
  /** The asset the page draws, for a fixture that asked for one. */
  asset: PublishedAsset | null
}

export interface PublishedAsset {
  id: string
  /**
   * The content hash, which every URL for this asset is built from.
   *
   * The key and not the whole URL: where assets are served from is the
   * environment's business and the renderer's, and a fixture that read it
   * would be a second copy of that decision. What a test needs to know is
   * which file, which is what the hash says.
   */
  sha256: string
  /** The one rendition, which is what `srcset` must offer. */
  rendition: { size: string; format: string; width: number }
}

/**
 * The asset a published page draws, as a row.
 *
 * Seeded rather than uploaded, which is what Phase 14 asks for in as many
 * words. The upload pipeline has its own end-to-end test in the Studio — a
 * real file through a real browser — and what is being proved here is the
 * other end: that a reference in a published revision becomes an `<img>` a
 * browser can fetch.
 *
 * One rendition, because one is enough to tell a `srcset` that was emitted
 * from one that was not, and because a second would only re-test the
 * arithmetic that `assetUrls` has unit tests for.
 */
async function picture(projectId: string, stamp: string): Promise<PublishedAsset> {
  const sha256 = stamp.replace(/\W/g, "").padEnd(64, "0").slice(0, 64)

  const row = await prisma.asset.create({
    data: {
      projectId,
      fileName: "hero.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 820_000,
      width: 1200,
      height: 800,
      storageKey: `assets/${sha256}.jpg`,
      // Where it is served from is built by the renderer from the
      // environment's base; this column is the master's own address.
      url: `https://assets.invalid/assets/${sha256}.jpg`,
      sha256,
      renditions: [
        { size: "thumbnail", format: "webp", width: 320, height: 213, sizeBytes: 4_100 },
      ],
    },
    select: { id: true },
  })

  return {
    id: row.id,
    sha256,
    rendition: { size: "thumbnail", format: "webp", width: 320 },
  }
}

/** A page with one section holding one text node, and no component registered for either. */
function document(asset: PublishedAsset | null): CheckoutSchema {
  const base = createDocument({
    projectId: "prj",
    pageId: "pge",
    themeId: defaultTheme.id,
  })

  return {
    ...base,
    settings: { seo: { title: "Complete your order", description: "Secure checkout." } },
    nodes: {
      [base.root]: { ...base.nodes[base.root]!, children: ["section_e2e"] },
      section_e2e: {
        id: "section_e2e",
        type: "core.section",
        parentId: base.root,
        children: asset === null ? ["text_e2e"] : ["text_e2e", "image_e2e"],
        props: {},
        styles: {
          desktop: { base: { padding: MOBILE_PADDING * 3 } },
          mobile: { base: { padding: MOBILE_PADDING } },
        },
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false },
      },
      text_e2e: {
        id: "text_e2e",
        type: "core.text",
        parentId: "section_e2e",
        children: [],
        props: { text: "Pay now" },
        styles: {},
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false },
      },
      ...(asset === null
        ? {}
        : {
            image_e2e: {
              id: "image_e2e",
              type: "core.image",
              parentId: "section_e2e",
              children: [],
              // A reference, which is what a document stores. Turning it into
              // URLs is the renderer's job and the thing under test.
              props: { src: { $asset: asset.id }, alt: "A hero" },
              styles: {},
              visibility: { hidden: false },
              animations: [],
              metadata: { locked: false },
            },
          }),
    },
  }
}

export async function publish(
  label: string,
  options: { picture?: boolean } = {},
): Promise<Published> {
  // Unique per worker, not per millisecond: parallel workers each run their own
  // beforeAll, and two in the same millisecond collide on a unique index.
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const hostname = `e2e-${label}-${stamp}.example.test`
  const slug = "checkout"

  const user = await prisma.user.create({
    data: { email: `e2e-render-${label}-${stamp}@example.test`, passwordHash: "x" },
  })

  const project = await prisma.project.create({
    data: { userId: user.id, name: "Rendered", slug: `rendered-${stamp}` },
  })

  await prisma.domain.create({
    data: { projectId: project.id, hostname, verified: true, isPrimary: true },
  })

  const asset = options.picture === true ? await picture(project.id, stamp) : null
  const schema = JSON.parse(serialize(document(asset))) as object

  const page = await prisma.page.create({
    data: {
      projectId: project.id,
      title: "Checkout",
      slug,
      status: "published",
      draftSchema: schema,
    },
  })

  const revision = await prisma.revision.create({
    data: {
      pageId: page.id,
      number: 1,
      kind: "publish",
      schema,
      theme: defaultTheme as unknown as object,
      schemaVersion: "1.0.0",
      rendererVersion: "1.0.0",
      createdBy: user.id,
    },
  })

  await prisma.page.update({
    where: { id: page.id },
    data: { publishedRevisionId: revision.id, currentRevisionId: revision.id },
  })

  return { userId: user.id, hostname, slug, pageId: page.id, asset }
}

/** Leaves the database as it was found. */
export async function unpublish(published: Published): Promise<void> {
  await prisma.page.update({
    where: { id: published.pageId },
    data: { publishedRevisionId: null, currentRevisionId: null },
  })
  await prisma.user.delete({ where: { id: published.userId } })
}
