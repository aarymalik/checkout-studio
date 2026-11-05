import type { AssetUrls } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { AssetsProvider, useAssetResolver } from "../../src"

/**
 * The assets a document may refer to.
 *
 * Owned by this package rather than the application, because the inspector's
 * asset control will read it too — and that control lives here, where
 * `@checkout-studio/api` may not be imported. The canvas is the reader today.
 */

const URLS: Record<string, AssetUrls> = {
  ast_one: { src: "https://cdn.test/ast_one.png", width: 100, height: 80 },
}

function Reads(): ReactElement {
  const resolve = useAssetResolver()

  return (
    <>
      <p data-testid="resolved">{resolve("ast_one")?.src ?? "nothing"}</p>
      <p data-testid="missing">{resolve("ast_gone")?.src ?? "nothing"}</p>
    </>
  )
}

describe("inside the provider", () => {
  it("resolves a reference the canvas draws with", () => {
    render(
      <AssetsProvider urls={URLS}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("resolved")).toHaveTextContent("https://cdn.test/ast_one.png")
  })

  it("resolves an asset it does not have to nothing", () => {
    // Deleted after a page referenced it. The renderer reports `asset-missing`
    // and draws the rest, rather than failing over one picture.
    render(
      <AssetsProvider urls={URLS}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("missing")).toHaveTextContent("nothing")
  })

  it("resolves against the newest map after an upload", () => {
    // Uploading refreshes the route, and the fresh render brings a map with
    // the new asset in it. The canvas has to draw from that one.
    const { rerender } = render(
      <AssetsProvider urls={{}}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("resolved")).toHaveTextContent("nothing")

    rerender(
      <AssetsProvider urls={URLS}>
        <Reads />
      </AssetsProvider>,
    )

    expect(screen.getByTestId("resolved")).toHaveTextContent("https://cdn.test/ast_one.png")
  })
})

describe("outside the provider", () => {
  it("is a resolver that answers nothing", () => {
    /*
     * What a gallery, or a test rendering one control, gets. An empty library
     * is an ordinary state — every project starts in it — so the default is
     * that rather than an error.
     */
    render(<Reads />)

    expect(screen.getByTestId("resolved")).toHaveTextContent("nothing")
  })
})
