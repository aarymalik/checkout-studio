import { createError } from "../AppError"

export const editorErrors = {
  draftConflict: (expectedVersion: number, actualVersion: number) =>
    createError({
      code: "CONFLICT",
      domain: "editor",
      severity: "warning",
      recoverability: "user-retryable",
      message: `Draft version ${expectedVersion} is stale; current is ${actualVersion}`,
      userMessage: "This page was changed in another session.",
      status: 409,
      context: { expectedVersion, actualVersion },
    }),

  schemaInvalid: (nodeIds: readonly string[]) =>
    createError({
      code: "SCHEMA_INVALID",
      domain: "schema",
      severity: "error",
      recoverability: "recoverable",
      message: `Schema validation failed for ${nodeIds.length} node(s): ${nodeIds.slice(0, 5).join(", ")}`,
      userMessage: "Some components on this page couldn't be read.",
      remediation: { label: "Restore last good version", action: "undo" },
      status: 422,
      context: { nodeCount: nodeIds.length },
    }),

  autosaveFailed: (cause?: unknown) =>
    createError({
      code: "AUTOSAVE_FAILED",
      domain: "editor",
      severity: "warning",
      recoverability: "retryable",
      message: "Autosave failed; change queued for retry",
      userMessage: "Your changes couldn't be saved yet. We'll keep trying.",
      status: 503,
      cause,
    }),
} as const
