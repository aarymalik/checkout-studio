import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { AppError, createError, isAppError } from "./AppError"
import { Errors } from "./catalog"
import { databaseMessage, normalizeError } from "./normalize"
import { defaultRetryPolicy, delayFor, retry, shouldRetry } from "./retry"

describe("AppError", () => {
  const error = Errors.auth.unauthorized()

  it("carries a code, domain, severity and recoverability", () => {
    expect(error.code).toBe("UNAUTHORIZED")
    expect(error.domain).toBe("auth")
    expect(error.severity).toBe("error")
    expect(error.recoverability).toBe("user-retryable")
  })

  it("keeps the engineer's message separate from the user's", () => {
    expect(error.message).not.toBe(error.userMessage)
    expect(error.userMessage).toBe("Please sign in to continue.")
  })

  it("exposes only the user message to a client", () => {
    const publicShape = error.toPublic("req_1")

    expect(publicShape).toEqual({
      code: "UNAUTHORIZED",
      message: "Please sign in to continue.",
      correlationId: "req_1",
    })
    expect(JSON.stringify(publicShape)).not.toContain("session")
  })

  it("never leaks the cause to a client", () => {
    const withCause = Errors.infrastructure.database(
      "insert",
      new Error('relation "AuditLog" violates constraint pg_trigger_9f2a'),
    )

    const serialized = JSON.stringify(withCause.toPublic("req_1"))

    expect(serialized).not.toContain("pg_trigger_9f2a")
    expect(serialized).not.toContain("violates constraint")
    expect(Object.keys(withCause.toPublic("req_1"))).toEqual(["code", "message", "correlationId"])
  })

  it("is an Error, so it survives throw and instanceof", () => {
    expect(error).toBeInstanceOf(Error)
    expect(isAppError(error)).toBe(true)
    expect(isAppError(new Error("plain"))).toBe(false)
  })

  it("defaults the HTTP status from the domain", () => {
    expect(Errors.validation.invalidInput([]).status).toBe(422)
    expect(Errors.auth.unauthorized().status).toBe(401)
    expect(Errors.resource.notFound("Project").status).toBe(404)
    expect(Errors.infrastructure.unexpected(new Error("x")).status).toBe(500)
  })
})

describe("the catalog", () => {
  it("reports a missing resource as absent, never as forbidden", () => {
    const error = Errors.resource.notFound("Project", "proj_1")

    expect(error.status).toBe(404)
    expect(error.userMessage).not.toMatch(/permission|forbidden|access/i)
  })

  it("carries the limit, current usage and suggested plan on a quota error", () => {
    const error = Errors.resource.quotaExceeded({
      action: "publishPage",
      limit: 10,
      current: 10,
      planId: "starter",
      suggestedPlan: "growth",
    })

    expect(error.code).toBe("QUOTA_EXCEEDED")
    expect(error.context["suggestedPlan"]).toBe("growth")
    expect(error.details?.[0]?.message).toContain("10 of 10")
  })

  it("gives every catalog entry both messages", () => {
    const samples: AppError[] = [
      Errors.validation.invalidInput([]),
      Errors.validation.fileTooLarge(1, 2),
      Errors.auth.forbidden("x"),
      Errors.auth.sessionExpired(),
      Errors.resource.conflict("x"),
      Errors.resource.rateLimited(30),
      Errors.editor.draftConflict(1, 2),
      Errors.editor.schemaInvalid(["a"]),
      Errors.editor.autosaveFailed(),
      Errors.infrastructure.network("x"),
      Errors.infrastructure.timeout("x", 1),
      Errors.infrastructure.storage("x"),
    ]

    for (const error of samples) {
      expect(error.message.length, error.code).toBeGreaterThan(0)
      expect(error.userMessage.length, error.code).toBeGreaterThan(0)
      // User copy stays out of technical vocabulary.
      expect(error.userMessage, error.code).not.toMatch(/null|undefined|exception|stack|SQL/i)
    }
  })
})

describe("normalizeError", () => {
  it("passes an AppError through untouched", () => {
    const original = Errors.auth.unauthorized()
    expect(normalizeError(original)).toBe(original)
  })

  it("turns a Zod error into a validation error naming each field", () => {
    const schema = z.object({ email: z.string().email(), age: z.number() })
    const result = schema.safeParse({ email: "nope", age: "x" })

    const error = normalizeError(result.error)

    expect(error.code).toBe("VALIDATION_ERROR")
    expect(error.details).toHaveLength(2)
    expect(error.details?.map((d) => d.path)).toEqual(["email", "age"])
  })

  it("extracts the database's own message from a Prisma trigger violation", () => {
    // Prisma leaves the top-level message EMPTY for these and nests the real
    // text in the adapter error. A normaliser reading `.message` reports nothing.
    const prismaError = {
      name: "PrismaClientKnownRequestError",
      code: "P2003",
      message: "",
      meta: {
        modelName: "AuditLog",
        driverAdapterError: {
          cause: {
            originalCode: "23001",
            originalMessage: "AuditLog is append-only: UPDATE is not permitted.",
            kind: "RestrictViolation",
          },
        },
      },
    }

    expect(databaseMessage(prismaError)).toBe("AuditLog is append-only: UPDATE is not permitted.")

    const error = normalizeError(prismaError)
    expect(error.code).toBe("DATABASE_ERROR")
    expect(error.message).toContain("append-only")
    expect(error.severity).toBe("critical")
  })

  it("maps a unique constraint violation to a conflict", () => {
    const error = normalizeError({
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      message: "Unique constraint failed",
      meta: { modelName: "Page", target: ["projectId", "slug"] },
    })

    expect(error.code).toBe("CONFLICT")
    expect(error.status).toBe(409)
  })

  it("maps a missing record to a not-found", () => {
    const error = normalizeError({
      name: "PrismaClientKnownRequestError",
      code: "P2025",
      message: "Record not found",
      meta: { modelName: "Project" },
    })

    expect(error.status).toBe(404)
  })

  it("turns a failed fetch into a retryable network error", () => {
    const error = normalizeError(new TypeError("fetch failed"))

    expect(error.code).toBe("NETWORK_ERROR")
    expect(error.isRetryable).toBe(true)
  })

  it("turns anything unrecognised into an internal error without leaking it", () => {
    const error = normalizeError({ weird: true })

    expect(error.code).toBe("INTERNAL_ERROR")
    expect(error.toPublic("req").message).toBe("Something went wrong. We've been notified.")
  })

  it("never throws, whatever it is given", () => {
    for (const value of [null, undefined, 0, "", [], Symbol("x"), () => {}]) {
      expect(() => normalizeError(value)).not.toThrow()
    }
  })
})

describe("retry", () => {
  const noSleep = async () => {}

  it("returns the first successful result without retrying", async () => {
    const operation = vi.fn().mockResolvedValue("ok")

    expect(await retry(operation, { sleep: noSleep })).toBe("ok")
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it("retries a retryable failure up to the limit", async () => {
    const operation = vi.fn().mockRejectedValue(Errors.infrastructure.network("down"))

    await expect(retry(operation, { sleep: noSleep })).rejects.toThrow()
    expect(operation).toHaveBeenCalledTimes(defaultRetryPolicy.maxAttempts)
  })

  it("succeeds when a later attempt works", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Errors.infrastructure.network("down"))
      .mockResolvedValue("recovered")

    expect(await retry(operation, { sleep: noSleep })).toBe("recovered")
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it("never retries a non-retryable failure", async () => {
    const operation = vi.fn().mockRejectedValue(Errors.validation.invalidInput([]))

    await expect(retry(operation, { sleep: noSleep })).rejects.toThrow()
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it("never retries a conflict, however the policy is configured", () => {
    expect(shouldRetry(Errors.resource.conflict("x"), defaultRetryPolicy)).toBe(false)
  })

  it("backs off exponentially and caps the delay", () => {
    const policy = { ...defaultRetryPolicy, jitter: false }

    expect(delayFor(0, policy)).toBe(300)
    expect(delayFor(1, policy)).toBe(600)
    expect(delayFor(2, policy)).toBe(1_200)
    expect(delayFor(20, policy)).toBe(policy.maxDelayMs)
  })

  it("spreads retries with jitter so clients do not synchronise", () => {
    const delays = new Set(Array.from({ length: 20 }, () => delayFor(3, defaultRetryPolicy)))

    expect(delays.size).toBeGreaterThan(1)
  })

  it("reports each retry so the wait is visible in logs", async () => {
    const onRetry = vi.fn()
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Errors.infrastructure.timeout("op", 1))
      .mockResolvedValue("ok")

    await retry(operation, { sleep: noSleep, onRetry })

    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRetry.mock.calls[0]?.[0]).toBeInstanceOf(AppError)
  })

  it("normalises whatever the operation threw before rethrowing", async () => {
    const operation = vi.fn().mockRejectedValue("a bare string")

    await expect(retry(operation, { sleep: noSleep })).rejects.toBeInstanceOf(AppError)
  })
})

describe("createError", () => {
  it("builds an error from an explicit shape", () => {
    const error = createError({
      code: "CUSTOM",
      domain: "plugin",
      severity: "warning",
      recoverability: "recoverable",
      message: "internal",
      userMessage: "user",
    })

    expect(error.code).toBe("CUSTOM")
    expect(error.status).toBe(400)
  })
})
