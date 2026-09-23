import { type AppError } from "../AppError"
import { Errors } from "../catalog"

/**
 * Prisma errors.
 *
 * Prisma reports a database trigger violation with an EMPTY top-level message:
 * the text the database actually produced is nested in
 * `meta.driverAdapterError.cause.originalMessage`. Anything relying on
 * `error.message` for those is reporting nothing at all, which is precisely
 * how an append-only violation would go unnoticed.
 */

interface PrismaLikeError {
  name?: string
  code?: string
  message?: string
  meta?: {
    modelName?: string
    target?: string[] | string
    driverAdapterError?: {
      cause?: { originalCode?: string; originalMessage?: string; kind?: string }
    }
  }
}

export function isPrismaError(value: unknown): value is PrismaLikeError {
  if (typeof value !== "object" || value === null) return false
  const name = (value as { name?: unknown }).name
  return typeof name === "string" && name.startsWith("PrismaClient")
}

/** The message the database itself produced, if there is one. */
export function databaseMessage(error: unknown): string | undefined {
  if (!isPrismaError(error)) return undefined

  const original = error.meta?.driverAdapterError?.cause?.originalMessage
  if (original && original.length > 0) return original

  return error.message && error.message.length > 0 ? error.message : undefined
}

export function fromPrismaError(error: PrismaLikeError): AppError {
  const model = error.meta?.modelName ?? "record"
  const detail = databaseMessage(error) ?? `Prisma error ${error.code ?? "unknown"}`

  switch (error.code) {
    case "P2002": {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : (error.meta?.target ?? "a unique field")
      return Errors.resource.conflict(`${model} already exists with that ${target}`)
    }
    case "P2025":
      return Errors.resource.notFound(model)
    case "P2003":
    case "P2004":
      // Includes trigger-enforced refusals: append-only audit rows and
      // immutable revisions both surface here.
      return Errors.infrastructure.database(`${model}: ${detail}`, error)
    default:
      return Errors.infrastructure.database(`${model}: ${detail}`, error)
  }
}
