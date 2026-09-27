import { ImageResponse } from "next/og"
import { BRAND, BRAND_ACCENT, BRAND_MID, GLYPH } from "@/components/brand/colors"

/**
 * The icon iOS uses on a home screen.
 *
 * Generated rather than committed as a binary: it is the same three shapes as
 * icon.svg, and a second copy in a format nobody can read in a diff is a second
 * copy to forget about when the mark changes.
 *
 * No rounded corners — iOS applies its own mask, and a tile that rounds itself
 * first ends up with a pale ring around it.
 *
 * The stripe is a solid sample from the middle of the gradient. This is drawn
 * by a layout engine rather than a browser: it can fill a box with a gradient
 * but cannot continue one across a child, so a gradient on the stripe would
 * restart inside its own 20 pixels.
 */
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${BRAND}, ${BRAND_ACCENT})`,
      }}
    >
      <svg width="140" height="140" viewBox="0 0 32 32">
        <rect x="6" y="10" width="20" height="13" rx="2.5" fill={GLYPH} />
        <rect x="6" y="13.2" width="20" height="3.4" fill={BRAND_MID} />
      </svg>
    </div>,
    size,
  )
}
