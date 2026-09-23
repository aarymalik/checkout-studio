/**
 * Development seed.
 *
 * Produces a workspace that looks like a real one: a user with a subscription,
 * a project with a theme, and a page with a draft and a published revision.
 * Idempotent, so it can be run repeatedly without duplicating anything.
 *
 * Never run against production: it creates a known user with a known id.
 */
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const connectionString = process.env["DATABASE_URL"]

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Run via `pnpm db:seed`, which loads .env.local.")
}

if (process.env["NODE_ENV"] === "production") {
  throw new Error("Refusing to seed a production database.")
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const DEMO_EMAIL = "demo@checkoutstudio.test"

const emptySchema = {
  version: "1.0.0",
  projectId: "seed",
  pageId: "seed",
  theme: { themeId: "seed-theme", overrides: {} },
  settings: { currency: "usd", colorMode: "auto" },
  variables: {},
  root: "section_root",
  nodes: {
    section_root: {
      id: "section_root",
      type: "core.section",
      parentId: null,
      children: [],
      props: {},
      styles: { desktop: { base: {} } },
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false },
    },
  },
}

const defaultTheme = {
  colors: { primary: "#2563EB", background: "#FFFFFF", foreground: "#0A0A0A" },
  radius: { sm: "8px", md: "12px", lg: "18px" },
}

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { clerkId: "clerk_seed_demo", email: DEMO_EMAIL, fullName: "Demo User" },
  })

  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, planId: "free", status: "active" },
  })

  const project = await prisma.project.upsert({
    where: { userId_slug: { userId: user.id, slug: "demo-store" } },
    update: {},
    create: {
      userId: user.id,
      name: "Demo Store",
      slug: "demo-store",
      description: "Seeded workspace for local development.",
    },
  })

  const theme = await prisma.theme.findFirst({ where: { projectId: project.id } })
  if (!theme) {
    await prisma.theme.create({
      data: { projectId: project.id, name: "Demo Theme", tokens: defaultTheme },
    })
  }

  const page = await prisma.page.upsert({
    where: { projectId_slug: { projectId: project.id, slug: "checkout" } },
    update: {},
    create: {
      projectId: project.id,
      title: "Checkout",
      slug: "checkout",
      draftSchema: emptySchema,
    },
  })

  const existing = await prisma.revision.findFirst({ where: { pageId: page.id } })
  if (!existing) {
    const revision = await prisma.revision.create({
      data: {
        pageId: page.id,
        number: 1,
        kind: "publish",
        schema: emptySchema,
        theme: defaultTheme,
        schemaVersion: "1.0.0",
        rendererVersion: "1.0.0",
        createdBy: user.id,
      },
    })

    await prisma.page.update({
      where: { id: page.id },
      data: {
        publishedRevisionId: revision.id,
        currentRevisionId: revision.id,
        status: "published",
      },
    })
  }

  process.stdout.write(`Seeded: ${DEMO_EMAIL} → project "${project.name}" → page "${page.title}"\n`)
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
