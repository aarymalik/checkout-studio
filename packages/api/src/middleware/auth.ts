import "server-only"

import { prisma } from "@checkout-studio/database"
import { logger } from "@checkout-studio/observability"
import type { AuthenticatedUser } from "./chain"

/**
 * Authentication.
 *
 * Clerk owns credentials, sessions and MFA — docs/security.md is explicit that
 * we never implement authentication ourselves. This module's only job is to
 * turn a Clerk session into the local user row that owns the tenant's data.
 */

/**
 * Whether real credentials are present.
 *
 * `.env.example` ships placeholders so a fresh clone starts. With placeholders
 * there is no identity provider, so every protected route refuses the request
 * rather than the application refusing to boot. Production never reaches this:
 * the environment schema rejects placeholder values there.
 */
export function isAuthConfigured(): boolean {
  const secret = process.env["CLERK_SECRET_KEY"] ?? ""
  return secret.length > 0 && !secret.includes("replaceme")
}

export interface ClerkSession {
  userId: string | null
}

/** Resolves the Clerk session for a request. Injected so it can be tested. */
export type SessionResolver = (request: Request) => Promise<ClerkSession>

/**
 * Maps a Clerk user to ours, creating the row on first sight.
 *
 * Clerk is the source of truth for identity; this row is what everything else
 * hangs off, so it must exist before the first request does anything useful.
 */
export async function resolveLocalUser(
  clerkId: string,
  profile: { email: string; fullName?: string },
): Promise<AuthenticatedUser> {
  const user = await prisma.user.upsert({
    where: { clerkId },
    update: {},
    create: {
      clerkId,
      email: profile.email,
      ...(profile.fullName ? { fullName: profile.fullName } : {}),
    },
    select: { id: true },
  })

  return { userId: user.id }
}

export interface AuthenticatorOptions {
  resolveSession: SessionResolver
  /** Looks up the Clerk profile. Only called for a new local user. */
  loadProfile: (clerkId: string) => Promise<{ email: string; fullName?: string }>
}

export function createAuthenticator(options: AuthenticatorOptions) {
  return async function authenticate(request: Request): Promise<AuthenticatedUser | null> {
    if (!isAuthConfigured()) {
      logger.warn("auth.not_configured", {
        detail: "CLERK_SECRET_KEY is a placeholder; refusing the request",
      })
      return null
    }

    const session = await options.resolveSession(request)
    if (!session.userId) return null

    const existing = await prisma.user.findUnique({
      where: { clerkId: session.userId },
      select: { id: true },
    })

    if (existing) return { userId: existing.id }

    const profile = await options.loadProfile(session.userId)
    return resolveLocalUser(session.userId, profile)
  }
}

/** For public endpoints that still want the caller when one is present. */
export const anonymous: SessionResolver = async () => ({ userId: null })
