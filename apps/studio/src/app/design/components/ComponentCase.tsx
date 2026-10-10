"use client"

import { CheckoutRenderer } from "@checkout-studio/renderer"
import { defaultTheme } from "@checkout-studio/schema"
import { useMemo } from "react"
import type { ReactElement } from "react"

import { registry } from "@/studio/registry"
import { COMPONENT_CASES } from "./cases"

/**
 * One case, drawn the way a published page draws it.
 *
 * Through `CheckoutRenderer`, with the build's own registry and the default
 * theme — so what the screenshot shows is what a customer would see, down to
 * the token references becoming CSS variables. Mounting the components
 * directly would photograph something the product never produces.
 *
 * `mode="published"`, not `editor-preview`. The editor adds a minimum height
 * to an empty container and keeps a box for an image with no source, and those
 * belong in a picture of the editor rather than in a picture of the component.
 * The one case that is *about* the empty state asks for the editor on purpose.
 */
export function ComponentCase({
  id,
  colorMode,
}: {
  id: string
  /**
   * Told, not detected.
   *
   * The renderer emits the theme's dark values only when it knows to, and
   * nothing about a media query reaches it on its own. The first version of
   * this omitted the prop, so every "dark" screenshot in the matrix was a
   * photograph of a light checkout sitting on dark page chrome — fifteen
   * baselines that would never have caught a dark-mode regression, and looked
   * right enough at a glance to be believed.
   *
   * A parameter rather than `matchMedia`, so the server and the client agree
   * about what they are drawing.
   */
  colorMode: "light" | "dark"
}): ReactElement {
  const current = COMPONENT_CASES.find((testCase) => testCase.id === id)
  const document = useMemo(() => current?.document(), [current])

  if (current === undefined || document === undefined) return <p>No case named {id}.</p>

  return (
    <div data-case={id} className="w-full">
      <CheckoutRenderer
        schema={document}
        theme={defaultTheme}
        registry={registry}
        colorMode={colorMode}
        mode={id === "media-without-a-source" ? "editor-preview" : "published"}
      />
    </div>
  )
}
