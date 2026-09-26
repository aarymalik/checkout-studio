"use client"

import { RENDERERS } from "./renderers"

/**
 * One case, rendered.
 *
 * The screenshot's subject carries `data-case`, and the padding is there so a
 * shadow is not clipped by the element's own bounds.
 */
export function GalleryCase({ id }: { id: string }) {
  const render = RENDERERS[id]

  if (render === undefined) return <p>No renderer for {id}.</p>

  return (
    <div data-case={id} className="w-fit min-w-48 p-6">
      {render()}
    </div>
  )
}
