import { disconnect } from "../src/client"

/** See packages/cache/tests/globalTeardown.ts. */
export async function teardown(): Promise<void> {
  await disconnect()
}
