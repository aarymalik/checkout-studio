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
}

/** A page with one section holding one text node, and no component registered for either. */
function document(): CheckoutSchema {
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
        children: ["text_e2e"],
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
    },
  }
}

export async function publish(label: string): Promise<Published> {
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

  const schema = JSON.parse(serialize(document())) as object

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

  return { userId: user.id, hostname, slug, pageId: page.id }
}

/** Leaves the database as it was found. */
export async function unpublish(published: Published): Promise<void> {
  await prisma.page.update({
    where: { id: published.pageId },
    data: { publishedRevisionId: null, currentRevisionId: null },
  })
  await prisma.user.delete({ where: { id: published.userId } })
}
