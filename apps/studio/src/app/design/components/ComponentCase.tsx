"use client"

import { CheckoutRenderer } from "@checkout-studio/renderer"
import { defaultTheme } from "@checkout-studio/schema"
import { useMemo } from "react"
import type { ReactElement } from "react"

import { CheckoutProvider } from "@checkout-studio/plugin-checkout/renderer"

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
 * `mode="published"` unless a case says otherwise. The editor adds a minimum
 * height to an empty container and keeps a box for an image with no source,
 * and those belong in a picture of the editor rather than in a picture of the
 * component. A case that is *about* what the editor draws says so itself.
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

  const drawn = (
    <div data-case={id} className="w-full">
      <CheckoutRenderer
        schema={document}
        theme={defaultTheme}
        registry={registry}
        colorMode={colorMode}
        mode={current.mode ?? "published"}
      />
    </div>
  )

  /*
   * A checkout around the case, when it asks for one.
   *
   * The source answers from memory with the case's own quote. That is the
   * seam working as intended: the gallery is an application that renders
   * checkout components, and it supplies a data source the way the published
   * app will supply a different one.
   */
  if (current.quote === undefined) return drawn

  const quote = current.quote

  return (
    <CheckoutProvider source={{ quote: () => Promise.resolve({ ok: true, quote }) }}>
      {drawn}
    </CheckoutProvider>
  )
}
