import type { LibraryAsset } from "@checkout-studio/api"
import { EditorProvider, InsertProvider, useEditorStoreApi } from "@checkout-studio/editor"
import type { EditorStoreApi } from "@checkout-studio/editor"
import { createDocument } from "@checkout-studio/schema"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AssetsPanel } from "./AssetsPanel"
import { MIN_CELL } from "./grid"
import { expectNoViolations } from "../../../tests/axe"

/**
 * The media library.
 *
 * The list is the server's and comes in as a prop, so what is tested here is
 * the grid: that a thousand assets are not a thousand elements, that the
 * keyboard reaches every cell, and that an upload that was refused says which
 * file and why rather than failing silently.
 */

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

/**
 * jsdom lays nothing out, so a measured panel measures zero and the grid would
 * render one column of nothing. This is the panel's width, as the shell's
 * default.
 */
const PANEL_WIDTH = 320
const PANEL_HEIGHT = 600

function asset(index: number): LibraryAsset {
  return {
    id: `ast_${index}`,
    fileName: `picture-${index}.png`,
    mimeType: "image/png",
    kind: "image",
    sizeBytes: 12_000 + index,
    width: 1200,
    height: 800,
    folder: null,
    url: `https://assets.test/assets/hash${index}.png`,
    thumbnailUrl: `https://assets.test/assets/hash${index}/thumbnail-320.webp`,
    createdAt: "2026-10-01T00:00:00.000Z",
  }
}

const THREE = [asset(0), asset(1), asset(2)]

/**
 * The panel, inside the providers the shell puts it inside.
 *
 * `InsertProvider` is what lets a cell start a drag. It is deliberately not
 * `EditorProvider` on its own: the panel renders with no page open, where
 * there is no store at all, and the suite below has a case for that.
 */
function renderPanel(assets: readonly LibraryAsset[] = THREE) {
  let captured: EditorStoreApi | null = null

  function Capture() {
    captured = useEditorStoreApi()

    return <AssetsPanel projectId="prj_one" assets={assets} />
  }

  const result = render(
    <EditorProvider
      document={createDocument({
        projectId: "prj_one",
        pageId: "pag_one",
        themeId: "theme_default",
        random: () => 0.5,
      })}
      baseVersion={1}
    >
      <InsertProvider>
        <Capture />
      </InsertProvider>
    </EditorProvider>,
  )

  if (captured === null) throw new Error("The provider did not render.")

  return { ...result, store: captured as EditorStoreApi }
}

type Sent = { url: string; fileName: string | null }

let sent: Sent[]
let answer: { ok: boolean; message?: string }
/** The uploads in flight, for a test that drives one by hand. */
let uploads: FakeUpload[]
/** Whether an upload finishes by itself. False for the tests about progress. */
let autoComplete: boolean

/**
 * An `XMLHttpRequest` that goes nowhere.
 *
 * The panel uploads through XHR rather than `fetch`, which is the only way a
 * browser will say how much of a request body has gone. jsdom's own XHR would
 * try to make a real request, so this stands in for it — and with
 * `autoComplete` off it lets a test decide exactly when the bytes land and
 * when the server answers.
 */
class FakeUpload extends EventTarget {
  readonly upload = new EventTarget()
  responseText = ""
  private url = ""

  open(_method: string, url: string): void {
    this.url = url
  }

  send(body: FormData): void {
    const file = body.get("file")

    sent.push({ url: this.url, fileName: file instanceof File ? file.name : null })
    uploads.push(this)

    if (autoComplete) {
      queueMicrotask(() => {
        this.progress(1)
        this.finish()
      })
    }
  }

  /** Reports that this much of the file has gone, from 0 to 1. */
  progress(fraction: number): void {
    this.upload.dispatchEvent(
      new ProgressEvent("progress", { lengthComputable: true, loaded: fraction * 100, total: 100 }),
    )
  }

  /**
   * Stops, as a browser stops one.
   *
   * `loadend` after `abort`, in that order, because the client removes its
   * signal listener on `loadend` and doing it the other way round would let
   * a test pass against code that never cleaned up.
   */
  abort(): void {
    this.dispatchEvent(new Event("abort"))
    this.dispatchEvent(new Event("loadend"))
  }

  /** Answers, with whatever `answer` says this upload was. */
  finish(): void {
    this.responseText = JSON.stringify(
      answer.ok
        ? { success: true, data: { asset: asset(99) }, error: null, meta: {} }
        : {
            success: false,
            data: null,
            error: { code: "UPLOAD_REJECTED", message: answer.message },
            meta: {},
          },
    )

    this.dispatchEvent(new Event("load"))
    this.dispatchEvent(new Event("loadend"))
  }
}
/** What the delete endpoint answers. Refusals are the interesting half. */
let deletion: { ok: boolean; code?: string; message?: string }

beforeEach(() => {
  sent = []
  answer = { ok: true }
  deletion = { ok: true }
  uploads = []
  autoComplete = true
  refresh.mockClear()
  vi.stubGlobal("XMLHttpRequest", FakeUpload)

  /*
   * ResizeObserver does not exist in jsdom, and would report zero if it did.
   * This reports the panel's real width once, which is what the grid measures.
   *
   * Asynchronously, because the real one is. A stub that answered during
   * `observe` would make the first render and the measured render the same
   * render, which is the one thing a test of this cannot afford to assume:
   * in a browser there is a frame in between, and what the panel draws in it
   * is what a reader sees.
   */
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(): void {
        queueMicrotask(() => {
          this.callback(
            [{ contentRect: { width: PANEL_WIDTH, height: PANEL_HEIGHT } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          )
        })
      }

      unobserve(): void {}
      disconnect(): void {}
    },
  )

  // Everything but an upload, which goes through the XHR above.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      sent.push({ url, fileName: null })

      const envelope = deletion.ok
        ? { success: true, data: { deleted: true }, error: null, meta: {} }
        : {
            success: false,
            data: null,
            error: { code: deletion.code ?? "IN_USE", message: deletion.message },
            meta: {},
          }

      return new Response(JSON.stringify(envelope), {
        headers: { "content-type": "application/json" },
      })
    }),
  )
})

describe("the grid", () => {
  it("shows a cell for each asset, with its name", async () => {
    renderPanel()

    const grid = await screen.findByRole("grid", { name: "Assets" })

    expect(within(grid).getAllByRole("gridcell")).toHaveLength(3)
    expect(within(grid).getByText("picture-1.png")).toBeInTheDocument()
  })

  it("says how many rows there are, not how many are rendered", async () => {
    // 1,000 in three columns. A screen reader is told the size of the list;
    // the DOM holds what fits on the screen.
    renderPanel(Array.from({ length: 1_000 }, (_, index) => asset(index)))

    const grid = await screen.findByRole("grid", { name: "Assets" })

    expect(grid).toHaveAttribute("aria-rowcount", "334")
    expect(within(grid).getAllByRole("gridcell").length).toBeLessThan(40)
  })

  it("is never drawn before it has been measured", async () => {
    /*
     * The invariant a stale element reference depends on, and a layout jump
     * either way. Rendered at zero width the grid is one column; the
     * measurement a frame later rearranges it into three, rebuilding every
     * row — so a cell obtained from the first paint is detached by the second,
     * and a reader who had focus in one loses it.
     *
     * Asserted on the grid's first appearance rather than after waiting for it
     * to settle, because "it settles correctly" is what the un-measured render
     * also does.
     */
    renderPanel()

    const grid = await screen.findByRole("grid", { name: "Assets" })

    expect(grid).toHaveAttribute("aria-colcount", "3")

    const first = within(grid).getAllByRole("gridcell")[0]

    await waitFor(() => {
      expect(screen.getByRole("grid", { name: "Assets" })).toBeInTheDocument()
    })

    // The same element, not a replacement that happens to look like it.
    expect(within(screen.getByRole("grid", { name: "Assets" })).getAllByRole("gridcell")[0]).toBe(
      first,
    )
  })

  it("is three columns wide at the panel's width", async () => {
    renderPanel()

    const grid = await screen.findByRole("grid", { name: "Assets" })

    expect(grid).toHaveAttribute("aria-colcount", "3")
  })

  it("shows the smallest rendition rather than the master", async () => {
    /*
     * A cell is a couple of hundred pixels and a master may be four thousand.
     * Queried by element rather than by role: the alt is empty on purpose,
     * because the filename is already in the cell and a screen reader should
     * not hear it twice.
     */
    const { container } = renderPanel()

    await screen.findByRole("grid", { name: "Assets" })

    const thumbnail = container.querySelector("img")

    expect(thumbnail).toHaveAttribute("src", THREE[0]?.thumbnailUrl)
    expect(thumbnail).toHaveAttribute("loading", "lazy")
    expect(thumbnail).toHaveAttribute("alt", "")
  })

  it("shows what a file is when there is no picture of it", async () => {
    renderPanel([{ ...asset(0), mimeType: "font/woff2", kind: "font", fileName: "brand.woff2" }])

    expect(await screen.findByText("WOFF")).toBeInTheDocument()
  })

  it("sizes a cell from the measured width", async () => {
    renderPanel()

    const cells = await screen.findAllByRole("button", { name: /picture-/ })
    const width = Number(cells[0]?.style.width.replace("px", ""))

    expect(width).toBeGreaterThanOrEqual(MIN_CELL)
    expect(width).toBeLessThan(PANEL_WIDTH)
  })
})

describe("the keyboard", () => {
  it("is one tab stop for the whole grid", async () => {
    renderPanel()

    const cells = await screen.findAllByRole("button", { name: /picture-/ })

    expect(cells[0]).toHaveAttribute("tabindex", "0")
    expect(cells[1]).toHaveAttribute("tabindex", "-1")
    expect(cells[2]).toHaveAttribute("tabindex", "-1")
  })

  it("moves along the row with the arrows", async () => {
    // The one place real focus is asserted, because moving it is the whole
    // point of the key: the grid sets the tabindex and then asks the browser
    // to follow it, and a test that read only the tabindex would not notice
    // the second half never happening.
    renderPanel()

    await screen.findByRole("grid", { name: "Assets" })
    await userEvent.click(screen.getByRole("button", { name: /picture-0/ }))

    await userEvent.keyboard("{ArrowRight}")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /picture-1/ })).toHaveFocus()
    })
  })

  it("stays put at the end rather than wrapping to the start", async () => {
    /*
     * Asserted through the roving tabindex rather than `document.activeElement`.
     *
     * The tabindex is what the grid believes, and what decides where a Tab
     * lands and which cell the next arrow moves from — so it is the statement
     * worth making, and it survives the component re-rendering between the key
     * and the assertion. Reading `activeElement` instead made this the only
     * test in the suite that failed under load, because it asserted where the
     * browser had put focus rather than which cell the grid had chosen.
     *
     * Clicked rather than focused, for the same reason: a click sets the state
     * through the component, where `.focus()` sets it in the DOM and waits for
     * React to agree.
     */
    renderPanel()

    await screen.findByRole("grid", { name: "Assets" })
    await userEvent.click(screen.getByRole("button", { name: /picture-2/ }))

    expect(screen.getByRole("button", { name: /picture-2/ })).toHaveAttribute("tabindex", "0")

    await userEvent.keyboard("{ArrowRight}")

    expect(screen.getByRole("button", { name: /picture-2/ })).toHaveAttribute("tabindex", "0")
  })

  it("selects the focused cell with Enter", async () => {
    renderPanel()

    await screen.findByRole("grid", { name: "Assets" })

    screen.getByRole("button", { name: /picture-1/ }).focus()
    await userEvent.keyboard("{Enter}")

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /picture-1/ }).closest('[role="gridcell"]'),
      ).toHaveAttribute("aria-selected", "true")
    })
  })
})

describe("the asset somebody chose", () => {
  it("shows its shape, its size and its type", async () => {
    renderPanel()

    await screen.findByRole("grid", { name: "Assets" })
    await userEvent.click(screen.getByRole("button", { name: /picture-1/ }))

    expect(await screen.findByText(/1200×800/)).toHaveTextContent("12 KB")
    expect(screen.getByText(/1200×800/)).toHaveTextContent("image/png")
  })

  it("copies the master's URL, not the thumbnail's", async () => {
    const writeText = vi.fn(async () => undefined)

    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })

    renderPanel()

    await screen.findByRole("grid", { name: "Assets" })
    await userEvent.click(screen.getByRole("button", { name: /picture-1/ }))
    await userEvent.click(screen.getByRole("button", { name: "Copy URL" }))

    expect(writeText).toHaveBeenCalledWith(THREE[1]?.url)
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument()
  })
})

describe("uploading", () => {
  it("sends each file to the project's own endpoint", async () => {
    renderPanel()

    const input = screen.getByLabelText(/Upload files/)

    await userEvent.upload(input, [
      new File(["x"], "logo.png", { type: "image/png" }),
      new File(["y"], "hero.jpg", { type: "image/jpeg" }),
    ])

    await waitFor(() => {
      expect(sent).toHaveLength(2)
    })

    expect(sent[0]).toEqual({ url: "/api/projects/prj_one/assets", fileName: "logo.png" })
    expect(sent[1]?.fileName).toBe("hero.jpg")
  })

  it("asks the server for the list again rather than guessing at it", async () => {
    renderPanel()

    await userEvent.upload(
      screen.getByLabelText(/Upload files/),
      new File(["x"], "logo.png", { type: "image/png" }),
    )

    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it("says which file was refused and why", async () => {
    /*
     * A text file named `.png`, which the chooser lets through because the
     * name and the declared type say image. The server decides from the bytes
     * and refuses it — which is the whole point of `accept` being a courtesy
     * rather than the boundary.
     */
    answer = { ok: false, message: "That file type isn't supported." }

    renderPanel()

    await userEvent.upload(
      screen.getByLabelText(/Upload files/),
      new File(["not a png"], "notes.png", { type: "image/png" }),
    )

    expect(
      await screen.findByText("notes.png — That file type isn't supported."),
    ).toBeInTheDocument()
  })

  it("does not ask for the list again when nothing landed", async () => {
    answer = { ok: false, message: "That file type isn't supported." }

    renderPanel()

    await userEvent.upload(
      screen.getByLabelText(/Upload files/),
      new File(["not a png"], "notes.png", { type: "image/png" }),
    )

    await screen.findByText(/notes.png/)

    expect(refresh).not.toHaveBeenCalled()
  })
})

describe("narrowing the library", () => {
  const MIXED = [
    { ...asset(0), id: "ast_hero", fileName: "hero-banner.png" },
    {
      ...asset(1),
      id: "ast_logo",
      fileName: "Logo.svg",
      mimeType: "image/svg+xml",
      kind: "vector" as const,
    },
    {
      ...asset(2),
      id: "ast_font",
      fileName: "brand.woff2",
      mimeType: "font/woff2",
      kind: "font" as const,
    },
  ]

  it("shows only what the search matches", async () => {
    renderPanel(MIXED)

    await userEvent.type(screen.getByLabelText("Search assets"), "banner")

    const grid = await screen.findByRole("grid", { name: "Assets" })

    expect(within(grid).getAllByRole("gridcell")).toHaveLength(1)
    expect(within(grid).getByText("hero-banner.png")).toBeInTheDocument()
  })

  it("tells a screen reader the size of what is shown, not of the library", async () => {
    renderPanel(MIXED)

    await userEvent.type(screen.getByLabelText("Search assets"), "banner")

    await waitFor(() => {
      expect(screen.getByRole("grid", { name: "Assets" })).toHaveAttribute("aria-rowcount", "1")
    })
  })

  it("offers only the kinds that are there, with how many", async () => {
    // A library of logos should not offer to show the videos in it.
    renderPanel(MIXED)

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by kind" }))

    expect(await screen.findByRole("option", { name: "All (3)" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Images (1)" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Drawings (1)" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Video/ })).not.toBeInTheDocument()
  })

  it("shows one kind when one is chosen", async () => {
    renderPanel(MIXED)

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by kind" }))
    await userEvent.click(await screen.findByRole("option", { name: "Fonts (1)" }))

    const grid = await screen.findByRole("grid", { name: "Assets" })

    await waitFor(() => {
      expect(within(grid).getAllByRole("gridcell")).toHaveLength(1)
    })

    expect(within(grid).getByText("brand.woff2")).toBeInTheDocument()
  })

  it("reorders without dropping anything", async () => {
    renderPanel(MIXED)

    await userEvent.click(screen.getByRole("combobox", { name: "Sort by" }))
    await userEvent.click(await screen.findByRole("option", { name: "Name" }))

    const grid = await screen.findByRole("grid", { name: "Assets" })

    await waitFor(() => {
      expect(within(grid).getAllByRole("gridcell")).toHaveLength(3)
    })

    // The filename's own element, not the cell's text — a file with no picture
    // of it also shows what it is, and "WOFFbrand.woff2" is not a name.
    const names = within(grid)
      .getAllByText(/\.(png|svg|woff2)$/)
      .map((label) => label.textContent)

    expect(names).toEqual(["brand.woff2", "hero-banner.png", "Logo.svg"])
  })

  it("says so when nothing matches, rather than showing an empty grid", async () => {
    renderPanel(MIXED)

    await userEvent.type(screen.getByLabelText("Search assets"), "nowhere")

    expect(await screen.findByText("Nothing matches")).toBeInTheDocument()
    expect(screen.queryByRole("grid")).not.toBeInTheDocument()
  })

  it("keeps showing the asset somebody was reading about", async () => {
    /*
     * The details come from the whole library rather than from what is shown,
     * so typing in the search box does not pull the panel out from under
     * somebody who was looking at one asset.
     */
    renderPanel(MIXED)

    await screen.findByRole("grid", { name: "Assets" })
    await userEvent.click(screen.getByRole("button", { name: /brand.woff2/ }))
    await userEvent.type(screen.getByLabelText("Search assets"), "banner")

    await screen.findByText("hero-banner.png")

    expect(screen.getByRole("button", { name: "Copy URL" })).toBeInTheDocument()
  })

  it("has no violations with the controls shown", async () => {
    const { container } = renderPanel(MIXED)

    await screen.findByRole("grid", { name: "Assets" })
    await expectNoViolations(container)
  })
})

describe("a library with nothing in it", () => {
  it("says so, and still offers the way to fill it", async () => {
    renderPanel([])

    expect(screen.getByText("No assets yet")).toBeInTheDocument()
    expect(screen.getByLabelText(/Upload files/)).toBeInTheDocument()
    expect(screen.queryByRole("grid")).not.toBeInTheDocument()

    // Nothing to narrow, so nothing to narrow it with.
    expect(screen.queryByLabelText("Search assets")).not.toBeInTheDocument()
  })
})

describe("accessibility", () => {
  it("has no violations with a grid of assets", async () => {
    const { container } = renderPanel()

    await screen.findByRole("grid", { name: "Assets" })
    await expectNoViolations(container)
  })

  it("has no violations when it is empty", async () => {
    const { container } = renderPanel([])

    await expectNoViolations(container)
  })
})

describe("dragging an asset onto the canvas", () => {
  /**
   * The press, which is where the gesture starts.
   *
   * On the press rather than on a movement threshold, as the component
   * library does it: the canvas resolves the drag and ends it on pointer-up,
   * so a press that never moves ends with nothing inserted.
   */
  async function press(name: string): Promise<void> {
    // Found rather than got: the grid is not drawn until the panel has been
    // measured, and the measurement arrives a microtask later as the real
    // one arrives a frame later.
    const cell = await screen.findByRole("button", { name })

    await userEvent.pointer({ keys: "[MouseLeft>]", target: cell })
  }

  it("tells the store what the canvas should make", async () => {
    /*
     * A node described before it exists, already pointing at the asset. The
     * canvas is the only thing that knows where anything is, so it resolves
     * where this lands; the store is how the two panels speak without either
     * importing the other.
     */
    const { store } = renderPanel()

    await press("picture-0.png")

    expect(store.getState().drag.inserting).toEqual({
      type: "core.image",
      props: { src: { $asset: "ast_0" } },
    })
  })

  it("starts nothing for a file no component shows", async () => {
    // Nothing on a page is a font. No insertion means the canvas draws no
    // drop indicator, which is the honest way to say it would land nowhere.
    const font: LibraryAsset = {
      ...asset(0),
      id: "ast_font",
      fileName: "inter.woff2",
      mimeType: "font/woff2",
      kind: "font",
      width: null,
      height: null,
    }
    const { store } = renderPanel([font])

    await press("inter.woff2")

    expect(store.getState().drag.inserting).toBeNull()
  })

  it("starts nothing for a reader who may not write", async () => {
    // Looking and copying a URL are not edits. Putting a picture on the page
    // is, and a second editor holding the session must not be able to.
    const { store } = renderPanel()

    act(() => {
      store.getState().setCanEdit(false)
    })

    await press("picture-0.png")

    expect(store.getState().drag.inserting).toBeNull()
  })

  it("still selects what was pressed", async () => {
    // The click handler is untouched: a press that goes nowhere is how
    // somebody reads an asset's size and type, and the drag must not cost
    // them that.
    renderPanel()

    await userEvent.click(await screen.findByRole("button", { name: "picture-1.png" }))

    expect(screen.getByText("picture-1.png", { selector: "p" })).toBeVisible()
  })
})

describe("deleting an asset", () => {
  /** Chooses a cell, which is what puts the details strip on screen. */
  async function choose(name: string): Promise<void> {
    await userEvent.click(await screen.findByRole("button", { name }))
  }

  async function openDialog(name = "picture-0.png"): Promise<void> {
    renderPanel()
    await choose(name)
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
  }

  it("offers nothing to delete until something is chosen", async () => {
    renderPanel()

    await screen.findByRole("grid", { name: "Assets" })

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
  })

  it("asks first, naming the file", async () => {
    // A misplaced click should not be able to take somebody's picture.
    await openDialog()

    expect(screen.getByRole("dialog")).toHaveTextContent("Delete picture-0.png?")
  })

  it("says in advance that one in use cannot be deleted", async () => {
    /*
     * Somebody who knows this goes and takes the picture off the page.
     * Somebody who finds out by being refused goes looking for a bug.
     */
    await openDialog()

    expect(screen.getByRole("dialog")).toHaveTextContent("still uses cannot be deleted")
  })

  it("does nothing when it is dismissed", async () => {
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }))

    expect(sent).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })

  it("sends the delete for the chosen asset", async () => {
    await openDialog("picture-1.png")
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }))

    await waitFor(() => {
      expect(sent[0]?.url).toBe("/api/projects/prj_one/assets/ast_1")
    })
  })

  it("refetches the list rather than editing a copy of it", async () => {
    // The list is the server's. Two copies disagree the moment one of them
    // fails to update.
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }))

    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it("closes, and stops showing the asset that has gone", async () => {
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    expect(screen.queryByRole("button", { name: "Copy URL" })).toBeNull()
  })
})

describe("a delete the server refuses", () => {
  it("says where it is still used, in the dialog that asked", async () => {
    /*
     * In the dialog and not the panel's problem strip, which is behind it.
     * "Still used on Checkout" is an answer to the question being asked right
     * there.
     */
    deletion = {
      ok: false,
      code: "IN_USE",
      message: "Still used on Checkout. Take it off there first.",
    }

    renderPanel()

    await userEvent.click(await screen.findByRole("button", { name: "picture-0.png" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Still used on Checkout")
  })

  it("stays open, and leaves the library alone", async () => {
    deletion = { ok: false, code: "IN_USE", message: "Still used on Checkout." }

    renderPanel()

    await userEvent.click(await screen.findByRole("button", { name: "picture-0.png" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }))

    await screen.findByRole("alert")

    expect(screen.getByRole("dialog")).toBeVisible()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("clears the last refusal when the dialog is opened again", async () => {
    // A stale "still in use" over a different asset is a sentence about
    // something nobody asked about.
    deletion = { ok: false, code: "IN_USE", message: "Still used on Checkout." }

    renderPanel()

    await userEvent.click(await screen.findByRole("button", { name: "picture-0.png" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }))
    await screen.findByRole("alert")

    await userEvent.click(screen.getByRole("button", { name: "Keep it" }))
    await userEvent.click(screen.getByRole("button", { name: "picture-1.png" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))

    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("while files are going up", () => {
  /** A file chosen through the zone's input, which is how the product does it. */
  async function choose(...names: readonly string[]): Promise<void> {
    renderPanel()
    autoComplete = false

    await userEvent.upload(
      screen.getByLabelText(/Upload files/),
      names.map((name) => new File(["x"], name, { type: "image/png" })),
    )
  }

  function bar(): HTMLElement {
    return screen.getByRole("progressbar")
  }

  it("says how much of the file has gone", async () => {
    /*
     * The number is the bytes the browser has handed over. There is no other
     * number: fetch cannot report one at all, which is why this goes through
     * XMLHttpRequest.
     */
    await choose("hero.png")

    act(() => {
      uploads[0]?.progress(0.42)
    })

    expect(bar()).toHaveAttribute("aria-valuenow", "42")
  })

  it("stops counting once the bytes are up, and says what is happening instead", async () => {
    /*
     * The honest part. A photograph's bytes arrive in a second and the server
     * then spends several re-encoding it into four sizes and two formats — a
     * bar that sat at 100% for the longer half would read as stuck, and one
     * that crept on a timer would be inventing progress.
     */
    await choose("hero.png")

    act(() => {
      uploads[0]?.progress(1)
    })

    expect(bar()).not.toHaveAttribute("aria-valuenow")
    expect(screen.getByText(/Storing hero\.png/)).toBeVisible()
  })

  it("names the file, because a refusal has to be about one", async () => {
    await choose("hero.png")

    act(() => {
      uploads[0]?.progress(0.5)
    })

    expect(screen.getByText("hero.png")).toBeVisible()
  })

  it("counts them when there are several, and not when there is one", async () => {
    // "1 of 1" answers a question nobody asked.
    await choose("one.png")

    act(() => {
      uploads[0]?.progress(0.5)
    })

    expect(screen.queryByText(/1 of 1/)).toBeNull()
  })

  it("moves on to the next file, counting as it goes", async () => {
    await choose("one.png", "two.png")

    act(() => {
      uploads[0]?.progress(1)
      uploads[0]?.finish()
    })

    await waitFor(() => {
      expect(uploads).toHaveLength(2)
    })

    act(() => {
      uploads[1]?.progress(0.5)
    })

    expect(screen.getByText(/2 of 2 · two\.png/)).toBeVisible()
  })

  it("shows nothing once they are all done", async () => {
    await choose("hero.png")

    act(() => {
      uploads[0]?.progress(1)
      uploads[0]?.finish()
    })

    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).toBeNull()
    })
  })
})

describe("stopping an upload", () => {
  async function choose(...names: readonly string[]): Promise<void> {
    renderPanel()
    autoComplete = false

    await userEvent.upload(
      screen.getByLabelText(/Upload files/),
      names.map((name) => new File(["x"], name, { type: "image/png" })),
    )
  }

  it("is not offered when nothing is going up", async () => {
    renderPanel()

    await screen.findByRole("grid", { name: "Assets" })

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
  })

  it("stops the queue, leaving the rest unsent", async () => {
    await choose("one.png", "two.png", "three.png")

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.getByText(/2 files were not sent/)).toBeVisible()
    })

    // One request was made and no more. The two behind it never started.
    expect(sent).toHaveLength(1)
  })

  it("says which file was interrupted, separately from the ones never sent", async () => {
    /*
     * Two different facts. The files behind it were not sent at all; this one
     * was stopped partway, and whether the server had already taken it is not
     * something the browser can say.
     */
    await choose("one.png", "two.png")

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(await screen.findByText(/one\.png — Upload stopped/)).toBeVisible()
  })

  it("counts nothing as unsent when the last file is the one stopped", async () => {
    await choose("only.png")

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).toBeNull()
    })

    expect(screen.queryByText(/were not sent/)).toBeNull()
  })

  it("asks the server what actually landed", async () => {
    /*
     * Aborting a request whose body is already up does not un-run what the
     * server started, so whether that file is in the library is a question
     * only the server can answer. The list is its answer.
     */
    await choose("one.png", "two.png")

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it("keeps what was already stored", async () => {
    // They asked for the rest not to go, not for the ones that did to come
    // back. The library is where they can undo that themselves.
    await choose("one.png", "two.png", "three.png")

    act(() => {
      uploads[0]?.progress(1)
      uploads[0]?.finish()
    })

    await waitFor(() => {
      expect(uploads).toHaveLength(2)
    })

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.getByText(/One file was not sent/)).toBeVisible()
    })

    expect(sent).toHaveLength(2)
  })

  it("lets the zone be used again afterwards", async () => {
    await choose("one.png", "two.png")

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
    })

    expect(screen.getByLabelText(/Upload files/)).toBeEnabled()
  })
})

describe("with no page open", () => {
  /**
   * The panel, with no store behind it at all.
   *
   * What the product shows when a project has no page: the shell renders the
   * frame without an `EditorProvider`, because "a store built around a
   * document that does not exist would have to invent one". This panel is
   * supplied by the page rather than by the shell — what it lists is a server
   * query — so it is rendered in that state and has to survive it.
   *
   * It did not. Reaching for the store to start a drag threw during server
   * rendering and took the whole screen with it, and five end-to-end tests
   * went red while every test in this file passed, because every one of them
   * supplied a provider.
   */
  function renderAlone() {
    return render(<AssetsPanel projectId="prj_one" assets={THREE} />)
  }

  it("renders", async () => {
    renderAlone()

    expect(await screen.findByRole("grid", { name: "Assets" })).toBeVisible()
  })

  it("still shows what an asset is", async () => {
    // Looking and copying are not edits, so neither needs a page open.
    renderAlone()

    await userEvent.click(await screen.findByRole("button", { name: "picture-0.png" }))

    expect(screen.getByRole("button", { name: /Copy URL/ })).toBeVisible()
  })

  it("starts no drag, because there is nowhere to drag to", async () => {
    renderAlone()

    const cell = await screen.findByRole("button", { name: "picture-0.png" })

    await userEvent.pointer({ keys: "[MouseLeft>]", target: cell })

    // Nothing to assert on a store that does not exist. That this did not
    // throw is the assertion.
    expect(cell).toBeVisible()
  })
})
