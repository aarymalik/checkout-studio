import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { ThemeConflictError, themeRepository } from "../../src"
import { createTenant, prisma, truncateAll } from "../helpers"

/**
 * A project's theme.
 *
 * A project begins with none and gets one the first time somebody changes
 * something, which is what `resolveTheme` means by "a project with no themes
 * yet is the common case, not an error".
 */

async function project(userId: string): Promise<string> {
  const row = await prisma.project.create({
    data: { userId, name: "Project", slug: `project-${Date.now()}-${Math.random()}` },
  })

  return row.id
}

const TOKENS = { id: "theme_x", name: "Theme", version: "1.0.0", colors: { primary: "#2563eb" } }

describe("themeRepository", () => {
  beforeEach(truncateAll)

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("has nothing before anything is saved", async () => {
    const { userId } = await createTenant()
    const tenant = { userId, projectId: await project(userId) }

    expect(await themeRepository.forProject(tenant)).toBeNull()
    expect(await themeRepository.list(tenant)).toEqual([])
  })

  it("creates the row on the first save", async () => {
    const { userId } = await createTenant()
    const tenant = { userId, projectId: await project(userId) }

    const saved = await themeRepository.save(tenant, TOKENS)

    expect(saved.projectId).toBe(tenant.projectId)
    expect(saved.tokens).toMatchObject({ name: "Theme" })
  })

  it("updates the same row on the next save, rather than making a second", async () => {
    // A project has one theme. Two rows would make `resolveTheme`'s "exactly
    // one" fallback ambiguous and leave a project with a theme nobody sees.
    const { userId } = await createTenant()
    const tenant = { userId, projectId: await project(userId) }

    const first = await themeRepository.save(tenant, TOKENS)
    const second = await themeRepository.save(tenant, { ...TOKENS, name: "Changed" })

    expect(second.id).toBe(first.id)
    expect(await themeRepository.list(tenant)).toHaveLength(1)
  })

  it("refuses a save made against a copy that has moved on", async () => {
    /*
     * A theme is one row with no field-level merge behind it, so two people
     * with the panel open would otherwise take turns overwriting each other's
     * whole theme and neither would be told.
     */
    const { userId } = await createTenant()
    const tenant = { userId, projectId: await project(userId) }

    await themeRepository.save(tenant, TOKENS)

    const stale = new Date(Date.now() - 60_000)

    await expect(
      themeRepository.save(tenant, { ...TOKENS, name: "Later" }, { updatedAt: stale }),
    ).rejects.toBeInstanceOf(ThemeConflictError)
  })

  it("takes a save from a caller that does not claim to know", async () => {
    // A first write has nothing to be stale against, and a caller that passes
    // no expectation is saying it does not care.
    const { userId } = await createTenant()
    const tenant = { userId, projectId: await project(userId) }

    await themeRepository.save(tenant, TOKENS)

    await expect(themeRepository.save(tenant, { ...TOKENS, name: "Later" })).resolves.toBeTruthy()
  })

  it("cannot see another tenant's theme", async () => {
    // Not forbidden — invisible. The repository scopes on the project's owner.
    const mine = await createTenant()
    const theirs = await createTenant()
    const theirProject = await project(theirs.userId)

    await themeRepository.save({ userId: theirs.userId, projectId: theirProject }, TOKENS)

    const asMe = { userId: mine.userId, projectId: theirProject }

    expect(await themeRepository.forProject(asMe)).toBeNull()
    expect(await themeRepository.list(asMe)).toEqual([])
  })

  it("cannot write into another tenant's project", async () => {
    /*
     * The hole that invisibility opens if nothing closes it. Every read scopes
     * on the owner, so somebody else's project reads as a project with no
     * theme — the right answer for a read and the wrong premise for a write.
     * Creating on it would put a row into a project the caller does not own.
     */
    const mine = await createTenant()
    const theirs = await createTenant()
    const theirProject = await project(theirs.userId)

    await expect(
      themeRepository.save({ userId: mine.userId, projectId: theirProject }, TOKENS),
    ).rejects.toThrow(/not yours/)

    expect(await prisma.theme.count({ where: { projectId: theirProject } })).toBe(0)
  })

  it("cannot overwrite another tenant's existing theme", async () => {
    const mine = await createTenant()
    const theirs = await createTenant()
    const theirProject = await project(theirs.userId)

    await themeRepository.save({ userId: theirs.userId, projectId: theirProject }, TOKENS)

    await expect(
      themeRepository.save(
        { userId: mine.userId, projectId: theirProject },
        { ...TOKENS, name: "Mine now" },
      ),
    ).rejects.toThrow(/not yours/)

    const rows = await prisma.theme.findMany({ where: { projectId: theirProject } })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokens).toMatchObject({ name: "Theme" })
  })

  it("will not run without a project", async () => {
    const { userId } = await createTenant()

    await expect(themeRepository.forProject({ userId })).rejects.toThrow(/projectId is required/)
  })
})
