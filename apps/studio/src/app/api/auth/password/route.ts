import { authenticate, changePassword, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * Change a password while signed in.
 *
 * The current password is required even though the session proves who they
 * are: a session is left behind on a shared computer far more often than a
 * password is given away.
 */
export const POST = route(
  {
    authenticate,
    body: z.object({
      currentPassword: z.string().min(1).max(256),
      newPassword: z.string().min(1).max(256),
    }),
    rateLimit: { scope: "auth.password", limit: 10, windowSeconds: 60 * 60 },
  },
  async ({ body, request }) => {
    const session = await authenticate(request)

    if (session === null) throw Errors.auth.unauthorized()

    const changed = await changePassword({
      userId: session.userId,
      sessionId: session.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    })

    if (!changed) {
      throw Errors.validation.invalidInput([
        {
          path: "currentPassword",
          code: "invalid",
          message: "That is not your current password.",
        },
      ])
    }

    return { changed: true, message: "Password changed. Every other session has been signed out." }
  },
)
