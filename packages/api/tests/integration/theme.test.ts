import { beforeEach, describe, expect, it } from "vitest"
import { prisma, type TenantContext } from "@checkout-studio/database"
import { DEFAULT_THEME_ID, defaultTheme } from "@checkout-studio/schema"

import { resolveTheme, saveTheme } from "../../src/services/pages/theme"

/**
 * Resolving and writing a project's theme.
 *
 * The pair that makes an edit show up. A project begins with no theme row and
 * every page it already has references `theme_default`. What these protect is
 * that a project which writes a theme is a project whose pages then render
 * with it.
 *
 * A theme has two ids and they do different work. The row's is unique across
 * the database and is how storage finds it. The one inside the tokens is
 * logical, is what a document references, and is only ever looked up among one
 * project's own rows — so two projects may both hold a theme called
 * `theme_default` without ever meeting.
 */

let tenant: TenantContext

function projectId(): string {
  if (tenant.projectId === undefined) throw new Error("The fixture has no project.")

  return tenant.projectId
}

beforeEach(async () => {
  await prisma.theme.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `theme-${Date.now()}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })

  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `theme-${Date.now()}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("a project with no theme of its own", () => {
  it("renders with the system default", async () => {
    // The common case, not an error: nothing has created one and the default
    // is a coherent theme.
    const resolved = await resolveTheme(projectId(), { themeId: DEFAULT_THEME_ID })

    expect(resolved.id).toBe(DEFAULT_THEME_ID)
  })
})

describe("once it writes one", () => {
  it("is what its pages resolve to, although they reference the default", async () => {
    /*
     * The whole point of the slice. Pages made before the project had a theme
     * still reference `theme_default`, and resolving that to the system
     * default would leave the project with a theme nobody could see — the
     * opposite of "a theme edit shows instantly on every page".
     *
     * It resolves by id and not by the fallback, because a theme's *logical*
     * id is project-scoped: the row carries its own unique id for storage,
     * and the id inside the tokens is only ever looked up among one project's
     * rows. A project whose theme is still called `theme_default` is a
     * project that has not renamed it, not a project sharing one.
     */
    await saveTheme(tenant, { ...defaultTheme, name: "Ours" })

    const resolved = await resolveTheme(projectId(), { themeId: DEFAULT_THEME_ID })

    expect(resolved.name).toBe("Ours")
    expect(resolved.id).toBe(DEFAULT_THEME_ID)
  })

  it("answers a reference to a theme it does not have", async () => {
    /*
     * The fallback, which is the safety net rather than the main path. A
     * document can name a theme the project no longer holds — a preset swapped
     * out, an import from elsewhere — and the project's own theme is a better
     * answer than the system default.
     */
    await saveTheme(tenant, { ...defaultTheme, id: "theme_ours", name: "Ours" })

    const resolved = await resolveTheme(projectId(), { themeId: "theme_gone" })

    expect(resolved.name).toBe("Ours")
  })

  it("carries the values that were written", async () => {
    await saveTheme(tenant, {
      ...defaultTheme,
      colors: { ...defaultTheme.colors, primary: "#2563eb" },
    })

    const resolved = await resolveTheme(projectId(), { themeId: DEFAULT_THEME_ID })

    expect(resolved.colors.primary).toBe("#2563eb")
  })

  it("still lets a page override a value on top of it", async () => {
    // Page overrides are sparse and sit above the project theme, and the
    // fallback must not have dropped them on its way past.
    await saveTheme(tenant, { ...defaultTheme, name: "Ours" })

    const resolved = await resolveTheme(projectId(), {
      themeId: DEFAULT_THEME_ID,
      overrides: { name: "This page" },
    })

    expect(resolved.name).toBe("This page")
  })

  it("resolves by id when the page names it properly", async () => {
    const saved = await saveTheme(tenant, { ...defaultTheme, id: "theme_ours", name: "Ours" })

    const resolved = await resolveTheme(projectId(), { themeId: saved.id })

    expect(resolved.name).toBe("Ours")
  })

  it("does not leak into another project", async () => {
    await saveTheme(tenant, { ...defaultTheme, name: "Ours" })

    const other = await prisma.project.create({
      data: { userId: tenant.userId, name: "Other", slug: `other-${Date.now()}` },
    })

    const resolved = await resolveTheme(other.id, { themeId: DEFAULT_THEME_ID })

    expect(resolved.id).toBe(DEFAULT_THEME_ID)
  })
})

describe("writing one", () => {
  it("refuses a theme that is not one", async () => {
    /*
     * The tokens land in a JSON column and come back out through a parse, so
     * something unparseable would be dropped silently on the way back and the
     * project would appear to have no theme at all.
     */
    await expect(
      saveTheme(tenant, { ...defaultTheme, colors: { primary: "not a colour" } } as never),
    ).rejects.toThrow()
  })

  it("leaves the project with exactly one theme, however many times it is written", async () => {
    await saveTheme(tenant, { ...defaultTheme, name: "One" })
    await saveTheme(tenant, { ...defaultTheme, name: "Two" })
    await saveTheme(tenant, { ...defaultTheme, name: "Three" })

    expect(await prisma.theme.count({ where: { projectId: projectId() } })).toBe(1)
  })
})
