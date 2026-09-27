import { route, verifyEmail } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * Confirm an email address.
 *
 * Rate limited by address rather than by account, because whoever is trying a
 * token does not have an account yet — that is the point of the token.
 */
export const POST = route(
  {
    authenticate: async () => null,
    requireAuth: false,
    body: z.object({ token: z.string().min(1).max(256) }),
    rateLimit: { scope: "auth.verify", limit: 20, windowSeconds: 60 * 60 },
  },
  async ({ body }) => {
    const verified = await verifyEmail(body.token)

    if (!verified) {
      // Expired, already used, or never real. Which of the three is not
      // something the holder of a bad token needs to know.
      throw Errors.validation.invalidInput([
        {
          path: "token",
          code: "invalid",
          message: "That link has expired or has already been used. Ask for another.",
        },
      ])
    }

    return { verified: true }
  },
)
