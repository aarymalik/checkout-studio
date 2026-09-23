import { type AppError, isAppError } from "../AppError"
import { Errors } from "../catalog"
import { fromFetchError, isFetchError } from "./fromFetch"
import { fromPrismaError, isPrismaError } from "./fromPrisma"
import { fromZodError, isZodError } from "./fromZod"

/**
 * Turns anything thrown anywhere into an AppError.
 *
 * This is the one function in the system that must always return: an error
 * handler that can itself throw leaves the caller with nothing to report.
 */
export function normalizeError(thrown: unknown): AppError {
  try {
    if (isAppError(thrown)) return thrown
    if (isZodError(thrown)) return fromZodError(thrown)
    if (isPrismaError(thrown)) return fromPrismaError(thrown)
    if (isFetchError(thrown)) return fromFetchError(thrown)
    return Errors.infrastructure.unexpected(thrown)
  } catch {
    // Normalisation itself failed. Return something rather than propagating.
    return Errors.infrastructure.unexpected(thrown)
  }
}

export { databaseMessage, isPrismaError } from "./fromPrisma"
export { isZodError } from "./fromZod"
export { isFetchError } from "./fromFetch"
