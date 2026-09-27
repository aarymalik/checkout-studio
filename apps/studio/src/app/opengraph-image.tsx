import { ImageResponse } from "next/og"
import { BRAND, GLYPH, INK, MUTED, PAPER } from "@/components/brand/colors"

/**
 * The card a link to this product unfurls into.
 *
 * Deliberately plain: a name, a line and the mark. A link preview is read in
 * half a second at the size of a playing card, and anything more detailed
 * arrives as noise.
 */
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Checkout Studio — build checkout experiences that convert"

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 32,
        padding: 96,
        background: INK,
      }}
    >
      <svg width="96" height="96" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" fill={BRAND} />
        <path d="M7 15 L12.5 20.5 L10 23 L4.5 17.5 Z" fill={GLYPH} fillOpacity="0.5" />
        <path d="M24.5 8.5 L27 11 L13.5 24.5 L11 22 Z" fill={GLYPH} />
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 72, fontWeight: 600, color: PAPER, letterSpacing: -2 }}>
          Checkout Studio
        </div>
        <div style={{ fontSize: 32, color: MUTED }}>Build checkout experiences that convert.</div>
      </div>
    </div>,
    size,
  )
}
