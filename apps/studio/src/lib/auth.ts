import "server-only"

import { senderFor } from "@checkout-studio/api"
import type { AuthDependencies } from "@checkout-studio/api"
import { getEnv } from "@/env"

/**
 * What the authentication flows need from this application.
 *
 * Built per request rather than at module load: the environment is validated
 * lazily so a build does not require credentials, and reaching for it at import
 * time would undo that.
 */
export function authDependencies(): AuthDependencies {
  const env = getEnv()

  return {
    email: senderFor(env.RESEND_API_KEY, env.EMAIL_FROM),
    appUrl: env.APP_URL,
    sessionSecret: env.AUTH_SESSION_SECRET,
  }
}

/** Cookies are marked Secure everywhere but a developer's machine. */
export function cookiesAreSecure(): boolean {
  return getEnv().NODE_ENV !== "development"
}

/**
 * Where a client appears to be, for the session list.
 *
 * The first hop of x-forwarded-for, which is the client as the platform saw it.
 * Later hops are proxies, and the header is attacker-controlled before it
 * reaches one — which is why this is only ever used for a fingerprint nobody
 * is shown and nothing is decided by.
 */
export function originOf(request: Request): { userAgent?: string; ip?: string } {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = forwarded ?? request.headers.get("x-real-ip") ?? undefined
  const userAgent = request.headers.get("user-agent") ?? undefined

  return {
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(ip === undefined ? {} : { ip }),
  }
}
