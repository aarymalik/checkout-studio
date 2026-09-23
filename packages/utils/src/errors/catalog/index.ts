import { authErrors } from "./auth"
import { editorErrors } from "./editor"
import { infrastructureErrors } from "./infrastructure"
import { resourceErrors } from "./resource"
import { validationErrors } from "./validation"

/**
 * The error catalog.
 *
 * Errors are never constructed ad hoc. Centralising them is what makes the
 * code list complete, the user-facing copy reviewable in one place, and
 * translation possible later.
 */
export const Errors = {
  validation: validationErrors,
  auth: authErrors,
  resource: resourceErrors,
  editor: editorErrors,
  infrastructure: infrastructureErrors,
} as const
