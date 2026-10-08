import { authenticate, route } from "@checkout-studio/api"
import { isPreferenceKey, preferenceRepository } from "@checkout-studio/database"
import {
  DEFAULT_KEYMAP,
  DEFAULT_LAYOUT,
  SIDEBAR_TABS,
  normalizeLayout,
} from "@checkout-studio/editor"
import { LAYOUT } from "@checkout-studio/design-system"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * A person's studio preferences.
 *
 * Small, frequent writes: the panel layout is saved whenever a drag settles. So
 * the rate limit is generous enough for real use and low enough that a runaway
 * client cannot write in a loop.
 *
 * Each key validates its own shape. A preference is data the product wrote and
 * will read back, which makes it exactly as untrustworthy as anything else that
 * arrives over HTTP.
 */

/** Every scope a binding may belong to, from docs/keyboard-shortcuts.md. */
const SCOPE_IDS = [
  "global",
  "dashboard",
  "studio",
  "canvas",
  "canvas.selection",
  "canvas.multi-selection",
  "canvas.text-editing",
  "canvas.dragging",
  "layers",
  "inspector",
  "library",
  "overlay.dialog",
  "overlay.command-palette",
  "overlay.context-menu",
] as const

const shellLayout = z.object({
  leftWidth: z.number().int().min(LAYOUT.left.min).max(LAYOUT.left.max),
  rightWidth: z.number().int().min(LAYOUT.right.min).max(LAYOUT.right.max),
  leftCollapsed: z.boolean(),
  rightCollapsed: z.boolean(),
  sidebarTab: z.enum(SIDEBAR_TABS),
})

const keymap = z.object({
  /** Sparse: only what differs from what the product ships. */
  overrides: z
    .array(
      z.object({
        commandId: z.string().min(1).max(100),
        scope: z.enum(SCOPE_IDS),
        // Null disables the shortcut.
        binding: z
          .object({
            key: z.string().min(1).max(20),
            mod: z.boolean().optional(),
            shift: z.boolean().optional(),
            alt: z.boolean().optional(),
            ctrl: z.boolean().optional(),
          })
          .nullable(),
      }),
    )
    .max(500),
  /** WCAG 2.1.4: single-character shortcuts can be switched off. */
  characterKeysEnabled: z.boolean(),
})

const SCHEMAS = {
  "shell.layout": shellLayout,
  "keyboard.keymap": keymap,
} as const

/** The value a key falls back to when nothing has been stored. */
const DEFAULTS: Record<keyof typeof SCHEMAS, unknown> = {
  "shell.layout": DEFAULT_LAYOUT,
  "keyboard.keymap": DEFAULT_KEYMAP,
}

function keyOf(params: Record<string, string>): keyof typeof SCHEMAS {
  const key = params["key"]

  // Not 404: the set of preferences is a closed list, and asking for one that
  // is not on it is a malformed request rather than a missing resource.
  if (!isPreferenceKey(key)) {
    throw Errors.validation.invalidInput([
      { path: "key", code: "unknown", message: "Not a preference this product stores." },
    ])
  }

  return key
}

export const GET = route({ authenticate }, async ({ params, userId }) => {
  const key = keyOf(params)
  const stored = await preferenceRepository.get({ userId }, key)

  if (stored === null) return { key, value: DEFAULTS[key], stored: false }

  // A stored row may predate the current shape. The layout knows how to repair
  // itself field by field; everything else falls back whole.
  if (key === "shell.layout") return { key, value: normalizeLayout(stored), stored: true }

  const parsed = SCHEMAS[key].safeParse(stored)

  return parsed.success
    ? { key, value: parsed.data, stored: true }
    : { key, value: DEFAULTS[key], stored: false }
})

export const PUT = route(
  {
    authenticate,
    body: z.object({ value: z.unknown() }),
    rateLimit: { scope: "preferences.write", limit: 120, windowSeconds: 60 },
  },
  async ({ body, params, userId }) => {
    const key = keyOf(params)
    const parsed = SCHEMAS[key].safeParse(body.value)

    if (!parsed.success) {
      throw Errors.validation.invalidInput(
        parsed.error.issues.map((issue) => ({
          path: ["value", ...issue.path.map(String)].join("."),
          code: issue.code,
          message: issue.message,
        })),
      )
    }

    await preferenceRepository.set({ userId }, key, parsed.data)

    return { key, value: parsed.data }
  },
)

/** Forget a preference, so the product goes back to its defaults. */
export const DELETE = route(
  {
    authenticate,
    rateLimit: { scope: "preferences.clear", limit: 30, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const key = keyOf(params)
    const cleared = await preferenceRepository.clear({ userId }, key)

    return { key, cleared, value: DEFAULTS[key] }
  },
)
