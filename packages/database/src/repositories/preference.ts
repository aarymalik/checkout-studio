import "server-only"

import { prisma } from "../client"
import type { TenantContext } from "../tenant"

/**
 * Studio preferences.
 *
 * Stored per user and read back on any device. The shape of a value is the
 * caller's business: this layer stores and returns JSON, and every reader
 * validates what it gets, because a row written by an earlier version of the
 * product is the ordinary case rather than corruption.
 */

/** The preferences the product stores. A closed set, so a typo cannot create one. */
export const PREFERENCE_KEYS = ["shell.layout", "keyboard.keymap"] as const

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number]

export function isPreferenceKey(value: unknown): value is PreferenceKey {
  return typeof value === "string" && (PREFERENCE_KEYS as readonly string[]).includes(value)
}

export const preferenceRepository = {
  /** One preference, or null when it has never been set. */
  async get(tenant: TenantContext, key: PreferenceKey) {
    const row = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: tenant.userId, key } },
    })

    return row?.value ?? null
  },

  /** Everything this person has set, as a map. One query, not one per key. */
  async all(tenant: TenantContext): Promise<Partial<Record<PreferenceKey, unknown>>> {
    const rows = await prisma.userPreference.findMany({
      where: { userId: tenant.userId, key: { in: [...PREFERENCE_KEYS] } },
    })

    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  },

  /** Write a preference, replacing whatever was there. */
  async set(tenant: TenantContext, key: PreferenceKey, value: unknown) {
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: tenant.userId, key } },
      // Prisma types JSON writes as InputJsonValue; the caller has already
      // validated the shape, and undefined is not storable JSON.
      create: { userId: tenant.userId, key, value: value as object },
      update: { value: value as object },
    })
  },

  /** Forget a preference, so the next read falls back to the default. */
  async clear(tenant: TenantContext, key: PreferenceKey) {
    const result = await prisma.userPreference.deleteMany({
      where: { userId: tenant.userId, key },
    })

    return result.count === 1
  },
}
