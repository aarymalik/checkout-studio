import type { CheckoutTheme, FontDefinition } from "./types"

/**
 * The theme every new project starts from.
 *
 * Neutral on purpose. A checkout should look designed before anybody has opened
 * the theme panel, and it should look like the *user's* once they change one
 * colour — so the default carries structure (a type scale, a spacing rhythm, a
 * radius language) and almost no personality.
 *
 * Every value is a literal here and nowhere else. This is the one file in the
 * product allowed to contain raw colours and sizes, because this is where the
 * vocabulary is defined; docs/coding-standards.md forbids them everywhere else.
 */

const SYSTEM_STACK = [
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "Helvetica Neue",
  "Arial",
  "sans-serif",
]

const MONO_STACK = [
  "ui-monospace",
  "SFMono-Regular",
  "Menlo",
  "Consolas",
  "Liberation Mono",
  "monospace",
]

const sans: FontDefinition = {
  family: "Inter",
  source: "system",
  weights: [400, 500, 600, 700],
  fallback: SYSTEM_STACK,
}

const mono: FontDefinition = {
  family: "JetBrains Mono",
  source: "system",
  weights: [400, 500],
  fallback: MONO_STACK,
}

/**
 * A fixed timestamp, not `new Date()`.
 *
 * The default theme is a constant, and a constant that changes every time the
 * module loads breaks the renderer's memoisation key and makes every snapshot
 * of it differ from the last. The real timestamps are written when a project
 * creates its own theme from this one.
 */
const EPOCH = "1970-01-01T00:00:00.000Z"

export const DEFAULT_THEME_ID = "theme_default"

export const defaultTheme: CheckoutTheme = {
  id: DEFAULT_THEME_ID,
  name: "Default",
  version: "1.0.0",

  colors: {
    primary: "#4f46e5",
    primaryForeground: "#ffffff",

    background: "#ffffff",
    surface: "#ffffff",
    surfaceRaised: "#fafafa",

    foreground: "#0a0a0a",
    foregroundMuted: "#525252",

    border: "#e5e5e5",
    borderStrong: "#a3a3a3",

    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",

    focusRing: "#4f46e5",

    custom: {},
  },

  typography: {
    fontFamily: { heading: sans, body: sans, mono },
    scale: {
      display: { fontSize: "48px", lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: 700 },
      h1: { fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: 700 },
      h2: { fontSize: "30px", lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: 600 },
      h3: { fontSize: "24px", lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: 600 },
      h4: { fontSize: "20px", lineHeight: "1.25", letterSpacing: "0", fontWeight: 600 },
      bodyLarge: { fontSize: "18px", lineHeight: "1.6", letterSpacing: "0", fontWeight: 400 },
      body: { fontSize: "16px", lineHeight: "1.6", letterSpacing: "0", fontWeight: 400 },
      small: { fontSize: "14px", lineHeight: "1.6", letterSpacing: "0", fontWeight: 400 },
      caption: { fontSize: "13px", lineHeight: "1.6", letterSpacing: "0", fontWeight: 400 },
    },
    // Type shrinks slightly on narrower viewports; a 48px display line is a
    // wall of text on a 390px phone.
    fluidScale: { desktop: 1, tablet: 0.95, mobile: 0.9 },
  },

  spacing: {
    base: 8,
    scale: [0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96],
    density: { desktop: 1, tablet: 1, mobile: 0.875 },
  },

  radius: {
    none: "0",
    sm: "6px",
    md: "10px",
    lg: "16px",
    full: "9999px",
  },

  shadows: {
    none: "none",
    sm: "0 1px 2px rgba(10, 10, 10, 0.06)",
    md: "0 4px 12px rgba(10, 10, 10, 0.08)",
    lg: "0 12px 32px rgba(10, 10, 10, 0.10)",
    xl: "0 24px 64px rgba(10, 10, 10, 0.12)",
  },

  motion: {
    durationFast: "150ms",
    durationNormal: "180ms",
    durationSlow: "220ms",
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  },

  components: {},

  // Surfaces and text invert; the brand colour does not. Everything absent here
  // is inherited from above, which is what keeps the layer sparse.
  dark: {
    colors: {
      background: "#0a0a0a",
      surface: "#141414",
      surfaceRaised: "#1f1f1f",
      foreground: "#fafafa",
      foregroundMuted: "#a3a3a3",
      border: "#262626",
      borderStrong: "#525252",
    },
    // Shadows are nearly invisible on dark surfaces, so elevation is carried by
    // surface lightness instead and the shadows lose most of their weight.
    shadows: {
      sm: "0 1px 2px rgba(0, 0, 0, 0.4)",
      md: "0 4px 12px rgba(0, 0, 0, 0.5)",
      lg: "0 12px 32px rgba(0, 0, 0, 0.6)",
      xl: "0 24px 64px rgba(0, 0, 0, 0.7)",
    },
  },

  metadata: {
    createdAt: EPOCH,
    updatedAt: EPOCH,
    isPreset: true,
    presetId: "minimal",
    tags: ["neutral"],
  },
}
