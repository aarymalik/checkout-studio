/**
 * Tier 1 — primitives.
 *
 * Raw values with no meaning attached. A component never references a
 * primitive: it reads a semantic token, which resolves here. Primitives change
 * only when the brand changes.
 *
 * Colours are authored as hex because every check that matters — contrast
 * ratios, AA pairings — is exact in sRGB and needs no conversion. OKLCH belongs
 * to the checkout theme, where one seed colour is expanded into a scale and
 * perceptual evenness is the whole point (docs/theme-system.md).
 *
 * See docs/theme-system.md § Token Tiers.
 */

/** Every primitive name, so a semantic token cannot reference one that does not exist. */
export type PrimitiveName = keyof typeof primitives

export const primitives = {
  // ── Neutrals ───────────────────────────────────────────────────────────────
  // The interface is mostly neutral. Colour is reserved for actions.
  "gray-0": "#ffffff",
  "gray-50": "#fafafa",
  "gray-100": "#f4f4f5",
  "gray-150": "#ececee",
  "gray-200": "#e4e4e7",
  "gray-300": "#d4d4d8",
  "gray-400": "#a1a1aa",
  "gray-500": "#71717a",
  "gray-600": "#52525b",
  "gray-700": "#3f3f46",
  "gray-800": "#27272a",
  "gray-850": "#1f1f23",
  "gray-900": "#18181b",
  "gray-950": "#0a0a0b",

  // ── Blue — primary actions, selection, focus ───────────────────────────────
  "blue-50": "#eff6ff",
  "blue-100": "#dbeafe",
  "blue-200": "#bfdbfe",
  "blue-300": "#93c5fd",
  "blue-400": "#60a5fa",
  "blue-500": "#3b82f6",
  "blue-600": "#2563eb",
  "blue-700": "#1d4ed8",
  "blue-800": "#1e40af",
  "blue-900": "#1e3a8a",
  "blue-950": "#172554",

  // ── Green — success, published, connected, paid ────────────────────────────
  "green-50": "#f0fdf4",
  "green-100": "#dcfce7",
  "green-200": "#bbf7d0",
  "green-300": "#86efac",
  "green-400": "#4ade80",
  "green-500": "#22c55e",
  "green-600": "#16a34a",
  "green-700": "#15803d",
  "green-800": "#166534",
  "green-900": "#14532d",
  "green-950": "#052e16",

  // ── Amber — recommendations, AI suggestions, performance warnings ──────────
  "amber-50": "#fffbeb",
  "amber-100": "#fef3c7",
  "amber-200": "#fde68a",
  "amber-300": "#fcd34d",
  "amber-400": "#fbbf24",
  "amber-500": "#f59e0b",
  "amber-600": "#d97706",
  "amber-700": "#b45309",
  "amber-800": "#92400e",
  "amber-900": "#78350f",
  "amber-950": "#451a03",

  // ── Red — validation, errors, destructive actions ──────────────────────────
  "red-50": "#fef2f2",
  "red-100": "#fee2e2",
  "red-200": "#fecaca",
  "red-300": "#fca5a5",
  "red-400": "#f87171",
  "red-500": "#ef4444",
  "red-600": "#dc2626",
  "red-700": "#b91c1c",
  "red-800": "#991b1b",
  "red-900": "#7f1d1d",
  "red-950": "#450a0a",

  // ── Spacing — the 8px system from docs/design-system.md ────────────────────
  // 4 is the only sub-8 step, for tight control affordances.
  "size-0": "0px",
  "size-1": "4px",
  "size-2": "8px",
  "size-3": "12px",
  "size-4": "16px",
  "size-6": "24px",
  "size-8": "32px",
  "size-10": "40px",
  "size-12": "48px",
  "size-16": "64px",
  "size-20": "80px",
  "size-24": "96px",

  // ── Radius ─────────────────────────────────────────────────────────────────
  // Named by value, not by role: a primitive called "card" would already be a
  // semantic, and the two tiers must not share a name.
  "radius-0": "0px",
  "radius-8": "8px",
  "radius-12": "12px",
  "radius-16": "16px",
  "radius-18": "18px",
  "radius-20": "20px",
  "radius-full": "9999px",

  // ── Typography ─────────────────────────────────────────────────────────────
  "font-sans": '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
  "font-secondary": '"Geist", "Inter", ui-sans-serif, system-ui, sans-serif',
  "font-mono": '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',

  // Sizes, named by value. "h1" and "body" are roles, and roles live a tier up.
  "text-48": "48px",
  "text-36": "36px",
  "text-30": "30px",
  "text-24": "24px",
  "text-20": "20px",
  "text-18": "18px",
  "text-16": "16px",
  "text-14": "14px",
  "text-13": "13px",
  "text-12": "12px",
  "text-11": "11px",

  "leading-115": "1.15",
  "leading-125": "1.25",
  "leading-160": "1.6",

  "weight-regular": "400",
  "weight-medium": "500",
  "weight-semibold": "600",

  // ── Shadows ────────────────────────────────────────────────────────────────
  // Soft and low-contrast. Elevation is communicated by spacing first.
  "shadow-raw-1": "0 1px 2px 0 rgb(9 9 11 / 0.05), 0 1px 3px 0 rgb(9 9 11 / 0.06)",
  "shadow-raw-2": "0 2px 4px -1px rgb(9 9 11 / 0.06), 0 4px 12px -2px rgb(9 9 11 / 0.08)",
  "shadow-raw-3": "0 8px 16px -4px rgb(9 9 11 / 0.10), 0 16px 32px -8px rgb(9 9 11 / 0.12)",
  "shadow-raw-4": "0 12px 24px -6px rgb(9 9 11 / 0.12), 0 24px 48px -12px rgb(9 9 11 / 0.16)",
  "shadow-raw-5": "0 24px 48px -12px rgb(9 9 11 / 0.18), 0 48px 96px -24px rgb(9 9 11 / 0.22)",

  // ── Motion ─────────────────────────────────────────────────────────────────
  // CLAUDE.md fixes the range: nothing animates outside 150–220ms.
  "duration-150": "150ms",
  "duration-180": "180ms",
  "duration-200": "200ms",
  "duration-220": "220ms",
  "easing-out": "cubic-bezier(0.16, 1, 0.3, 1)",

  // ── Layout — docs/theme-system.md § Studio Theme ───────────────────────────
  "layout-toolbar": "64px",
  "layout-status-bar": "32px",
  "layout-panel-left": "320px",
  "layout-panel-left-min": "260px",
  "layout-panel-left-max": "420px",
  "layout-panel-left-collapsed": "64px",
  "layout-panel-right": "340px",
  "layout-panel-right-min": "300px",
  "layout-panel-right-max": "460px",

  // ── Opacity ────────────────────────────────────────────────────────────────
  // Percentages, so color-mix() and opacity can consume them unchanged.
  "alpha-focus": "40%",
  "alpha-selection": "15%",
  "alpha-overlay": "60%",
  "alpha-disabled": "50%",
} as const satisfies Record<string, string>
