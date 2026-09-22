/**
 * The API response envelope from docs/api-spec.md.
 *
 * Every endpoint returns this shape, success or failure, so a client never has
 * to guess how to read a response.
 */

export interface ApiMeta {
  /** Ties this response to its server logs and trace. Present on every response. */
  correlationId: string
  timestamp: string
  pagination?: Pagination
}

export interface ApiError {
  /** Stable, documented, machine-readable. See docs/error-handling.md. */
  code: string
  /** The user-facing message. Never an internal one. */
  message: string
  /** Present only for VALIDATION_ERROR and QUOTA_EXCEEDED. */
  details?: readonly ApiErrorDetail[]
}

export interface ApiErrorDetail {
  path: string
  code: string
  message: string
}

export interface ApiSuccess<TData> {
  success: true
  data: TData
  error: null
  meta: ApiMeta
}

export interface ApiFailure {
  success: false
  data: null
  error: ApiError
  meta: ApiMeta
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * This package emits no runtime code, so the direction is a type, not a const
 * array. The runtime list lives with the validator that needs it.
 */
export type SortDirection = "asc" | "desc"
