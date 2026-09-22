import { getEnv } from "@/env"

/**
 * Runs once when the server starts.
 *
 * Validating the environment here is what makes a missing or malformed
 * variable a startup failure with a precise message, rather than a confusing
 * error on some later request. See docs/phases.md, Phase 1.
 */
export function register(): void {
  getEnv()
}
