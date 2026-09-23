import { createRouteHandler } from "uploadthing/next"
import { createFileRouter } from "@/lib/uploadthing"
import { Errors } from "@checkout-studio/utils"

/**
 * Uploads are authenticated. Phase 7 replaces this authorizer with the Clerk
 * session; until an identity provider is configured, every upload is refused.
 */
const fileRouter = createFileRouter(async () => {
  throw Errors.auth.unauthorized()
})

export const { GET, POST } = createRouteHandler({ router: fileRouter })
