import { type AppError, type ErrorDetail } from "../AppError"
import { Errors } from "../catalog"

interface ZodLikeError {
  name?: string
  issues?: Array<{ path: Array<string | number | symbol>; code?: string; message: string }>
}

export function isZodError(value: unknown): value is ZodLikeError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as ZodLikeError
  return candidate.name === "ZodError" && Array.isArray(candidate.issues)
}

/**
 * Validation errors report which field failed and why — never which value
 * would have succeeded, which would make the endpoint an oracle.
 */
export function fromZodError(error: ZodLikeError): AppError {
  const details: ErrorDetail[] = (error.issues ?? []).map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    code: issue.code ?? "invalid",
    message: issue.message,
  }))

  return Errors.validation.invalidInput(details)
}
