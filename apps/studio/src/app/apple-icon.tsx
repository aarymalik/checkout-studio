import { ImageResponse } from "next/og"
import { BRAND, GLYPH } from "@/components/brand/colors"

/**
 * The icon iOS uses on a home screen.
 *
 * Generated rather than committed as a binary: it is the same two shapes as
 * icon.svg, and a second copy in a format nobody can read in a diff is a second
 * copy to forget about when the mark changes.
 *
 * No rounded corners here — iOS applies its own mask, and a tile that rounds
 * itself first ends up with a pale ring around it.
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
        background: BRAND,
      }}
    >
      <svg width="112" height="112" viewBox="0 0 32 32">
        <path d="M7 15 L12.5 20.5 L10 23 L4.5 17.5 Z" fill={GLYPH} fillOpacity="0.5" />
        <path d="M24.5 8.5 L27 11 L13.5 24.5 L11 22 Z" fill={GLYPH} />
      </svg>
    </div>,
    size,
  )
}
