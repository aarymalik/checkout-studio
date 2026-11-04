import type { LibraryAsset } from "@checkout-studio/api"
import type { AssetUrls } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ReactElement, ReactNode } from "react"

import { ProjectAssetsProvider, useAssetResolver, useProjectAssets } from "./ProjectAssets"

/**
 * The project's assets, as the canvas and a picker each need them.
 *
 * Two projections of one query. What these protect is that they stay one
 * query: a panel showing an asset a picker cannot offer, or a canvas drawing
 * one the panel does not list, is a disagreement nobody would think to look
 * for.
 */

function asset(id: string): LibraryAsset {
  return {
    id,
    fileName: `${id}.png`,
    mimeType: "image/png",
    kind: "image",
    sizeBytes: 1_000,
    width: 100,
    height: 80,
    url: `https://cdn.test/${id}.png`,
    thumbnailUrl: `https://cdn.test/${id}/thumbnail-320.webp`,
    createdAt: "2026-11-01T00:00:00.000Z",
  }
}

const URLS: Record<string, AssetUrls> = {
  ast_one: { src: "https://cdn.test/ast_one.png", width: 100, height: 80 },
}

function Reads(): ReactElement {
  const assets = useProjectAssets()
  const resolve = useAssetResolver()

  return (
    <>
      <p data-testid="names">{assets.map((one) => one.fileName).join(", ")}</p>
      <p data-testid="resolved">{resolve("ast_one")?.src ?? "nothing"}</p>
      <p data-testid="missing">{resolve("ast_gone")?.src ?? "nothing"}</p>
    </>
  )
}

function mount(children: ReactNode) {
  return render(children)
}

describe("inside the provider", () => {
  it("offers the list a picker chooses from", () => {
    mount(
      <ProjectAssetsProvider assets={[asset("ast_one"), asset("ast_two")]} urls={URLS}>
        <Reads />
      </ProjectAssetsProvider>,
    )

    expect(screen.getByTestId("names")).toHaveTextContent("ast_one.png, ast_two.png")
  })

  it("resolves a reference the canvas draws with", () => {
    mount(
      <ProjectAssetsProvider assets={[asset("ast_one")]} urls={URLS}>
        <Reads />
      </ProjectAssetsProvider>,
    )

    expect(screen.getByTestId("resolved")).toHaveTextContent("https://cdn.test/ast_one.png")
  })

  it("resolves an asset it does not have to nothing", () => {
    // Deleted after a page referenced it. The renderer reports `asset-missing`
    // and draws the rest, rather than failing over one picture.
    mount(
      <ProjectAssetsProvider assets={[asset("ast_one")]} urls={URLS}>
        <Reads />
      </ProjectAssetsProvider>,
    )

    expect(screen.getByTestId("missing")).toHaveTextContent("nothing")
  })
})

describe("when the project's assets change", () => {
  it("offers the new list, even if the URLs did not change", () => {
    /*
     * Uploading refreshes the route, and a fresh render brings a longer list.
     * Both projections come from the same query and are usually new objects
     * together — but the list changing is what has to reach the picker, and
     * tying the memo to the URL map alone would serve yesterday's library
     * from behind an unchanged one.
     */
    const { rerender } = mount(
      <ProjectAssetsProvider assets={[asset("ast_one")]} urls={URLS}>
        <Reads />
      </ProjectAssetsProvider>,
    )

    expect(screen.getByTestId("names")).toHaveTextContent("ast_one.png")

    rerender(
      <ProjectAssetsProvider assets={[asset("ast_one"), asset("ast_new")]} urls={URLS}>
        <Reads />
      </ProjectAssetsProvider>,
    )

    expect(screen.getByTestId("names")).toHaveTextContent("ast_one.png, ast_new.png")
  })
})

describe("outside the provider", () => {
  it("is an empty library and a resolver that answers nothing", () => {
    /*
     * What a gallery or a test rendering one control gets. An empty library is
     * a state the picker has to handle anyway, because a project starts with
     * one — so the default is the ordinary case rather than an error.
     */
    mount(<Reads />)

    expect(screen.getByTestId("names")).toHaveTextContent("")
    expect(screen.getByTestId("resolved")).toHaveTextContent("nothing")
  })
})
