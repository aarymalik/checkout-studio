import { close } from "@checkout-studio/cache"
import { disconnect } from "@checkout-studio/database"

/** See packages/cache/tests/globalTeardown.ts. */
export async function teardown(): Promise<void> {
  await Promise.allSettled([disconnect(), close()])
}
