import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { useState } from "react"
import type { ReactElement } from "react"

import { AssetsProvider, Control } from "../../src"
import type { EditorAsset } from "../../src"

/**
 * The asset control: a property that points at something in the library.
 *
 * The value is a reference — `{ "$asset": "ast_one" }` — and not a URL. The
 * renderer resolves it before a component sees anything, which is what lets a
 * deleted asset be reported rather than drawn as a broken image, and what lets
 * one upload be used in six places.
 */

const SRC: PropertyDefinition = defineProperties([
  { key: "src", target: "prop", label: "Source", group: "General", control: "asset" },
])[0] as PropertyDefinition

const HERO: EditorAsset = {
  id: "ast_hero",
  name: "hero.png",
  previewUrl: "https://cdn.test/ast_hero-thumb.png",
  urls: { src: "https://cdn.test/ast_hero.png", width: 1200, height: 600 },
}

const LOGO: EditorAsset = {
  id: "ast_logo",
  name: "logo.svg",
  previewUrl: "https://cdn.test/ast_logo.svg",
  urls: { src: "https://cdn.test/ast_logo.svg" },
}

/** A font: in the library, and nothing an `<img>` can draw. */
const FONT: EditorAsset = {
  id: "ast_font",
  name: "inter.woff2",
  previewUrl: null,
  urls: { src: "https://cdn.test/ast_font.woff2" },
}

/**
 * The control, wired to state the way the inspector wires it.
 *
 * A controlled value that never moves snaps back after every choice, which
 * would hide exactly the thing worth testing: that what the control writes is
 * what it then shows.
 */
function picker(value: unknown, assets: readonly EditorAsset[], onChange = vi.fn()) {
  function Harness(): ReactElement {
    const [held, setHeld] = useState<unknown>(value)

    return (
      <AssetsProvider assets={assets}>
        <Control
          definition={SRC}
          value={held}
          onChange={(next) => {
            setHeld(next)
            onChange(next)
          }}
        />
      </AssetsProvider>
    )
  }

  const rendered = render(<Harness />)

  return { ...rendered, onChange }
}

describe("choosing an asset", () => {
  it("offers the project's assets by name", async () => {
    picker(null, [HERO, LOGO, FONT])

    await userEvent.click(screen.getByRole("combobox"))

    expect(screen.getByRole("option", { name: "hero.png" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "logo.svg" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "inter.woff2" })).toBeInTheDocument()
  })

  it("shows each asset's thumbnail beside its name", async () => {
    /*
     * What makes this a picture being picked rather than a file name being
     * picked. A font has no thumbnail and gets none: the alternative is a
     * broken image in every row of the list.
     */
    picker(null, [HERO, FONT])

    await userEvent.click(screen.getByRole("combobox"))

    expect(screen.getByRole("option", { name: "hero.png" }).querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/ast_hero-thumb.png",
    )
    expect(screen.getByRole("option", { name: "inter.woff2" }).querySelector("img")).toBeNull()
  })

  it("writes a reference rather than a URL", async () => {
    /*
     * The whole point of the control. A URL written into the document would be
     * a URL that outlives the asset: deleting it would leave a hard 404 on a
     * published checkout, and the usage check that refuses the delete would
     * have nothing to find.
     */
    const { onChange } = picker(null, [HERO, LOGO])

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "logo.svg" }))

    expect(onChange).toHaveBeenLastCalledWith({ $asset: "ast_logo" })
  })

  it("shows the asset a reference names", () => {
    picker({ $asset: "ast_hero" }, [HERO, LOGO])

    expect(screen.getByRole("combobox")).toHaveTextContent("hero.png")
  })

  it("shows what was chosen after choosing it", async () => {
    /*
     * Asserted on the preview and not only on the trigger. The trigger keeps
     * its own state once it has been used, so it would go on showing the right
     * name even if nothing we wrote came back — which is how a control that
     * writes into a void looks right until the page is reloaded. The preview
     * is drawn from the value we were handed, so it can only be the one that
     * was stored.
     */
    const { container, onChange } = picker({ $asset: "ast_hero" }, [HERO, LOGO])

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "logo.svg" }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("combobox")).toHaveTextContent("logo.svg")
    expect(container.querySelector('[data-inspector-preview="src"] img')).toHaveAttribute(
      "src",
      "https://cdn.test/ast_logo.svg",
    )
  })

  it("invites a choice when nothing is set", () => {
    picker(null, [HERO])

    expect(screen.getByRole("combobox")).toHaveTextContent("Choose an asset")
  })

  it("says Mixed rather than showing one selection's asset", () => {
    render(
      <AssetsProvider assets={[HERO, LOGO]}>
        <Control definition={SRC} value={{ $asset: "ast_hero" }} mixed onChange={vi.fn()} />
      </AssetsProvider>,
    )

    expect(screen.getByRole("combobox")).toHaveTextContent("Mixed")
  })
})

describe("the preview", () => {
  it("shows the asset that is set", () => {
    const { container } = picker({ $asset: "ast_hero" }, [HERO])
    const preview = container.querySelector('[data-inspector-preview="src"] img')

    expect(preview).toHaveAttribute("src", "https://cdn.test/ast_hero-thumb.png")
  })

  it("is decorative, because the control above it says the name", () => {
    // Two readings of "hero.png" is one more than anybody needs. The name is
    // in the trigger, where a reader meets it as the control's value.
    const { container } = picker({ $asset: "ast_hero" }, [HERO])

    expect(container.querySelector('[data-inspector-preview="src"] img')).toHaveAttribute("alt", "")
  })

  it("is not drawn for a file that has no picture", () => {
    /*
     * A font's master is a font. `thumbnailUrl` falls back to the master when
     * there are no renditions, so an `<img>` pointed at it would show a broken
     * image — worse than showing nothing, because it reads as a failed upload.
     */
    const { container } = picker({ $asset: "ast_font" }, [FONT])

    expect(screen.getByRole("combobox")).toHaveTextContent("inter.woff2")
    expect(container.querySelector('[data-inspector-preview="src"]')).toBeNull()
  })

  it("is not drawn while the selection disagrees", () => {
    // Two nodes, two different images. Showing either one's picture would
    // claim the pair share it.
    const { container } = render(
      <AssetsProvider assets={[HERO, LOGO]}>
        <Control definition={SRC} value={{ $asset: "ast_hero" }} mixed onChange={vi.fn()} />
      </AssetsProvider>,
    )

    expect(container.querySelector('[data-inspector-preview="src"]')).toBeNull()
  })
})

describe("an asset that is gone", () => {
  it("says so rather than reading as unset", () => {
    /*
     * An asset can be deleted while a page still names it. The canvas draws
     * that as a gap; a control showing "Choose an asset" over it would say
     * nobody had ever chosen, and the fix — pick it again — would not be
     * obvious from either.
     */
    picker({ $asset: "ast_deleted" }, [HERO, LOGO])

    expect(screen.getByRole("combobox")).toHaveTextContent("No longer in the library")
  })

  it("has no preview to show", () => {
    const { container } = picker({ $asset: "ast_deleted" }, [HERO])

    expect(container.querySelector('[data-inspector-preview="src"]')).toBeNull()
  })
})

describe("an empty library", () => {
  it("says where assets come from, rather than offering an empty list", () => {
    /*
     * Every project starts here. A select with nothing in it is a control that
     * cannot be used and does not say why — docs/ui-guidelines.md asks an
     * empty state to name the next step instead.
     */
    picker(null, [])

    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.getByText("No assets yet. Upload one in the Assets panel.")).toBeInTheDocument()
  })

  it("still says when what is set has gone", () => {
    // The last asset deleted while a page still pointed at it. "No assets
    // yet" would be true and useless: it hides that this property is broken.
    picker({ $asset: "ast_deleted" }, [])

    expect(
      screen.getByText(
        "This points at an asset that is gone, and there is nothing else to choose.",
      ),
    ).toBeInTheDocument()
  })

  it("names the property either way", () => {
    // Without the select there is no label element, and a row with no heading
    // is a sentence nobody can place.
    picker(null, [])

    expect(screen.getByText("Source")).toBeInTheDocument()
  })
})
