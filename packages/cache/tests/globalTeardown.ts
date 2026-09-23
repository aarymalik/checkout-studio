import { redis } from "../src/client"

/**
 * Closed once per run, not per file: test files share a worker process, so a
 * per-file afterAll would shut the connection the next file inherits.
 */
export async function teardown(): Promise<void> {
  await redis.quit()
}
