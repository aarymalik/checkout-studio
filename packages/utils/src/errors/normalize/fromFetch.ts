import { type AppError } from "../AppError"
import { Errors } from "../catalog"

export function isFetchError(value: unknown): value is Error {
  if (!(value instanceof Error)) return false
  return (
    value.name === "TypeError" ||
    value.name === "AbortError" ||
    value.name === "TimeoutError" ||
    value.message.includes("fetch failed")
  )
}

export function fromFetchError(error: Error): AppError {
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return Errors.infrastructure.timeout("request", 0)
  }
  return Errors.infrastructure.network(error.message)
}
