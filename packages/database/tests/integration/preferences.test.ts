import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { preferenceRepository, PREFERENCE_KEYS, isPreferenceKey } from "../../src"
import { createTenant, prisma, truncateAll } from "../helpers"

describe("preferenceRepository", () => {
  beforeEach(truncateAll)

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("returns null for a preference that was never set", async () => {
    const tenant = await createTenant()

    expect(await preferenceRepository.get(tenant, "shell.layout")).toBeNull()
  })

  it("stores and returns a value", async () => {
    const tenant = await createTenant()

    await preferenceRepository.set(tenant, "shell.layout", { leftWidth: 320 })

    expect(await preferenceRepository.get(tenant, "shell.layout")).toEqual({ leftWidth: 320 })
  })

  it("replaces a value rather than merging it", async () => {
    const tenant = await createTenant()

    await preferenceRepository.set(tenant, "shell.layout", { leftWidth: 320, rightWidth: 340 })
    await preferenceRepository.set(tenant, "shell.layout", { leftWidth: 400 })

    expect(await preferenceRepository.get(tenant, "shell.layout")).toEqual({ leftWidth: 400 })
  })

  it("returns everything a person has set, as a map", async () => {
    const tenant = await createTenant()

    await preferenceRepository.set(tenant, "shell.layout", { leftCollapsed: true })
    await preferenceRepository.set(tenant, "keyboard.keymap", { preset: "figma" })

    expect(await preferenceRepository.all(tenant)).toEqual({
      "shell.layout": { leftCollapsed: true },
      "keyboard.keymap": { preset: "figma" },
    })
  })

  it("returns an empty map for a person who has set nothing", async () => {
    const tenant = await createTenant()

    expect(await preferenceRepository.all(tenant)).toEqual({})
  })

  // Not "forbidden" — invisible. One person's settings cannot be read through
  // another person's context.
  it("keeps one person's preferences out of another's", async () => {
    const one = await createTenant()
    const two = await createTenant()

    await preferenceRepository.set(one, "shell.layout", { leftWidth: 400 })

    expect(await preferenceRepository.get(two, "shell.layout")).toBeNull()
    expect(await preferenceRepository.all(two)).toEqual({})
  })

  it("cannot be overwritten through another person's context", async () => {
    const one = await createTenant()
    const two = await createTenant()

    await preferenceRepository.set(one, "shell.layout", { leftWidth: 400 })
    await preferenceRepository.set(two, "shell.layout", { leftWidth: 260 })

    expect(await preferenceRepository.get(one, "shell.layout")).toEqual({ leftWidth: 400 })
  })

  describe("clear", () => {
    it("forgets a preference, so the next read falls back to the default", async () => {
      const tenant = await createTenant()
      await preferenceRepository.set(tenant, "shell.layout", { leftWidth: 400 })

      expect(await preferenceRepository.clear(tenant, "shell.layout")).toBe(true)
      expect(await preferenceRepository.get(tenant, "shell.layout")).toBeNull()
    })

    it("reports that nothing was there to clear", async () => {
      const tenant = await createTenant()

      expect(await preferenceRepository.clear(tenant, "shell.layout")).toBe(false)
    })

    it("cannot clear another person's preference", async () => {
      const one = await createTenant()
      const two = await createTenant()
      await preferenceRepository.set(one, "shell.layout", { leftWidth: 400 })

      expect(await preferenceRepository.clear(two, "shell.layout")).toBe(false)
      expect(await preferenceRepository.get(one, "shell.layout")).toEqual({ leftWidth: 400 })
    })
  })

  // A deleted account leaves no settings behind.
  it("goes with the account", async () => {
    const tenant = await createTenant()
    await preferenceRepository.set(tenant, "shell.layout", { leftWidth: 400 })

    await prisma.user.delete({ where: { id: tenant.userId } })

    expect(await prisma.userPreference.count()).toBe(0)
  })

  describe("isPreferenceKey", () => {
    it("accepts every key the product stores", () => {
      for (const key of PREFERENCE_KEYS) expect(isPreferenceKey(key)).toBe(true)
    })

    it("rejects anything else, so a typo cannot create a preference", () => {
      expect(isPreferenceKey("shell.layouts")).toBe(false)
      expect(isPreferenceKey(null)).toBe(false)
      expect(isPreferenceKey(42)).toBe(false)
    })
  })
})
