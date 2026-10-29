import type { LibraryAsset } from "@checkout-studio/api"
import { render, screen, waitFor, within } from "@testing-library/react"
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
    sizeBytes: 12_000 + index,
    width: 1200,
    height: 800,
    url: `https://assets.test/assets/hash${index}.png`,
    thumbnailUrl: `https://assets.test/assets/hash${index}/thumbnail-320.webp`,
    createdAt: "2026-10-01T00:00:00.000Z",
  }
}

const THREE = [asset(0), asset(1), asset(2)]

function renderPanel(assets: readonly LibraryAsset[] = THREE) {
  return render(<AssetsPanel projectId="prj_one" assets={assets} />)
}

type Sent = { url: string; fileName: string | null }

let sent: Sent[]
let answer: { ok: boolean; message?: string }

beforeEach(() => {
  sent = []
  answer = { ok: true }
  refresh.mockClear()

  /*
   * ResizeObserver does not exist in jsdom, and would report zero if it did.
   * This reports the panel's real width once, which is what the grid measures.
   */
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(): void {
        this.callback(
          [{ contentRect: { width: PANEL_WIDTH, height: PANEL_HEIGHT } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }

      unobserve(): void {}
      disconnect(): void {}
    },
  )

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: FormData }) => {
      const file = init?.body?.get("file")

      sent.push({ url, fileName: file instanceof File ? file.name : null })

      const envelope = answer.ok
        ? { success: true, data: { asset: asset(99) }, error: null, meta: {} }
        : {
            success: false,
            data: null,
            error: { code: "UPLOAD_REJECTED", message: answer.message },
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
    renderPanel([{ ...asset(0), mimeType: "font/woff2", fileName: "brand.woff2" }])

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
    renderPanel()

    const first = (await screen.findAllByRole("button", { name: /picture-/ }))[0]

    first?.focus()
    await userEvent.keyboard("{ArrowRight}")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /picture-1/ })).toHaveFocus()
    })
  })

  it("stays put at the end rather than wrapping to the start", async () => {
    renderPanel()

    const last = screen.getByRole("button", { name: /picture-2/ })

    last.focus()
    await userEvent.keyboard("{ArrowRight}")

    expect(last).toHaveFocus()
  })

  it("selects the focused cell with Enter", async () => {
    renderPanel()

    const second = screen.getByRole("button", { name: /picture-1/ })

    second.focus()
    await userEvent.keyboard("{Enter}")

    await waitFor(() => {
      expect(second.closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true")
    })
  })
})

describe("the asset somebody chose", () => {
  it("shows its shape, its size and its type", async () => {
    renderPanel()

    await userEvent.click(screen.getByRole("button", { name: /picture-1/ }))

    expect(await screen.findByText(/1200×800/)).toHaveTextContent("12 KB")
    expect(screen.getByText(/1200×800/)).toHaveTextContent("image/png")
  })

  it("copies the master's URL, not the thumbnail's", async () => {
    const writeText = vi.fn(async () => undefined)

    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })

    renderPanel()

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

describe("a library with nothing in it", () => {
  it("says so, and still offers the way to fill it", async () => {
    renderPanel([])

    expect(screen.getByText("No assets yet")).toBeInTheDocument()
    expect(screen.getByLabelText(/Upload files/)).toBeInTheDocument()
    expect(screen.queryByRole("grid")).not.toBeInTheDocument()
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
