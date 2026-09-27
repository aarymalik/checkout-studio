import { ImageResponse } from "next/og"
import { BRAND, BRAND_ACCENT, BRAND_MID, GLYPH, INK, MUTED, PAPER } from "@/components/brand/colors"

/**
 * The card a link to this product unfurls into.
 *
 * Deliberately plain: the mark, a name and a line. A link preview is read in
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
      <div
        style={{
          display: "flex",
          width: 112,
          height: 112,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${BRAND}, ${BRAND_ACCENT})`,
        }}
      >
        <svg width="88" height="88" viewBox="0 0 32 32">
          <rect x="6" y="10" width="20" height="13" rx="2.5" fill={GLYPH} />
          <rect x="6" y="13.2" width="20" height="3.4" fill={BRAND_MID} />
        </svg>
      </div>

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
