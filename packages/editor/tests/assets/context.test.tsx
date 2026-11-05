import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { AssetsProvider } from "../../src"
import type { EditorAsset } from "../../src"
import { useAssetResolver, useAssets } from "../../src/assets/context"

/**
 * The assets a document may refer to.
 *
 * Owned by this package rather than the application, because the inspector's
 * asset control reads it too — and that control lives here, where
 * `@checkout-studio/api` may not be imported. The canvas resolves references
 * through it; the control lists what there is to choose from.
 */

const ONE: EditorAsset = {
  id: "ast_one",
  name: "hero.png",
  previewUrl: "https://cdn.test/ast_one-thumb.png",
  urls: { src: "https://cdn.test/ast_one.png", width: 100, height: 80 },
}

function Reads(): ReactElement {
  const resolve = useAssetResolver()
  const assets = useAssets()

  return (
    <>
      <p data-testid="resolved">{resolve("ast_one")?.src ?? "nothing"}</p>
      <p data-testid="missing">{resolve("ast_gone")?.src ?? "nothing"}</p>
      <p data-testid="listed">{assets.map((asset) => asset.name).join(", ") || "none"}</p>
    </>
  )
}

describe("inside the provider", () => {
  it("resolves a reference the canvas draws with", () => {
    render(
      <AssetsProvider assets={[ONE]}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("resolved")).toHaveTextContent("https://cdn.test/ast_one.png")
  })

  it("lists the assets a picker offers", () => {
    render(
      <AssetsProvider assets={[ONE]}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("listed")).toHaveTextContent("hero.png")
  })

  it("resolves an asset it does not have to nothing", () => {
    // Deleted after a page referenced it. The renderer reports `asset-missing`
    // and draws the rest, rather than failing over one picture.
    render(
      <AssetsProvider assets={[ONE]}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("missing")).toHaveTextContent("nothing")
  })

  it("resolves against the newest list after an upload", () => {
    // Uploading refreshes the route, and the fresh render brings a list with
    // the new asset in it. The canvas has to draw from that one.
    const { rerender } = render(
      <AssetsProvider assets={[]}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("resolved")).toHaveTextContent("nothing")

    rerender(
      <AssetsProvider assets={[ONE]}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("resolved")).toHaveTextContent("https://cdn.test/ast_one.png")
  })
})

describe("outside the provider", () => {
  it("is a resolver that answers nothing, over no assets", () => {
    /*
     * What a gallery, or a test rendering one control, gets. An empty library
     * is an ordinary state — every project starts in it — so the default is
     * that rather than an error.
     */
    render(<Reads />)

    expect(screen.getByTestId("resolved")).toHaveTextContent("nothing")
    expect(screen.getByTestId("listed")).toHaveTextContent("none")
  })
})
