import { createError, type ErrorDetail } from "../AppError"

export const validationErrors = {
  invalidInput: (details: readonly ErrorDetail[]) =>
    createError({
      code: "VALIDATION_ERROR",
      domain: "validation",
      severity: "error",
      recoverability: "user-retryable",
      message: `Request validation failed for ${details.length} field(s)`,
      userMessage: "Please check the highlighted fields.",
      details,
      status: 422,
      context: { fieldCount: details.length },
    }),

  invalidFileType: (received: string, allowed: readonly string[]) =>
    createError({
      code: "INVALID_FILE_TYPE",
      domain: "validation",
      severity: "error",
      recoverability: "user-retryable",
      message: `Rejected upload of type ${received}; allowed: ${allowed.join(", ")}`,
      userMessage: "That file type isn't supported.",
      status: 422,
      context: { received },
    }),

  fileTooLarge: (bytes: number, maxBytes: number) =>
    createError({
      code: "FILE_TOO_LARGE",
      domain: "validation",
      severity: "error",
      recoverability: "user-retryable",
      message: `Upload of ${bytes} bytes exceeds the ${maxBytes} byte limit`,
      userMessage: `That file is too large. The maximum is ${Math.floor(maxBytes / 1_000_000)} MB.`,
      status: 422,
      context: { bytes, maxBytes },
    }),

  /**
   * An upload the asset pipeline would not store, for a reason of its own.
   *
   * One entry rather than nine, because the nine differ only in the sentence
   * shown — and a catalog that gained an entry every time the sanitizer
   * learned a new way to say no would be a catalog nobody reads. The reason is
   * carried in the context so a log says which, and `userMessage` is the part
   * a merchant can act on.
   */
  uploadRejected: (reason: string, userMessage: string) =>
    createError({
      code: "UPLOAD_REJECTED",
      domain: "validation",
      severity: "error",
      recoverability: "user-retryable",
      message: `Rejected upload: ${reason}`,
      userMessage,
      status: 422,
      context: { reason },
    }),
} as const
