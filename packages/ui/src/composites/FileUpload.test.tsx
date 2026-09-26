import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FileUpload } from "./FileUpload"
import { expectNoViolations } from "../../tests/axe"

/**
 * Drops a file on the zone.
 *
 * The route that matters for type validation: a file picker filters by the
 * `accept` attribute, and so does user-event, so uploading a disallowed type
 * through the input tests the test library rather than the component. A drop
 * has no such filter — in a browser or here.
 */
function drop(file: File): void {
  const zone = screen.getByText(/Add an image|Add images/).closest("label") as HTMLLabelElement

  // fireEvent rather than dispatchEvent: the handler sets state, and a raw
  // dispatch runs outside React's act, so nothing it changed is rendered by the
  // time the assertion looks.
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
}

function aFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}

describe("FileUpload", () => {
  it("is a real file input, not a div pretending to be one", () => {
    // Dragging is impossible with a keyboard. The drop zone is an addition;
    // the input underneath is the route everyone can take.
    render(<FileUpload label="Add an image" onFilesChange={vi.fn()} />)

    expect(screen.getByLabelText(/Add an image/)).toHaveAttribute("type", "file")
  })

  it("is reachable by Tab", async () => {
    render(<FileUpload label="Add an image" onFilesChange={vi.fn()} />)

    await userEvent.tab()

    expect(screen.getByLabelText(/Add an image/)).toHaveFocus()
  })

  it("reports a chosen file", async () => {
    const onFilesChange = vi.fn()
    render(<FileUpload label="Add an image" onFilesChange={onFilesChange} />)

    await userEvent.upload(
      screen.getByLabelText(/Add an image/),
      aFile("logo.png", "image/png", 100),
    )

    expect(onFilesChange).toHaveBeenCalledTimes(1)
    expect(onFilesChange.mock.calls[0]?.[0]?.[0]?.name).toBe("logo.png")
  })

  it("lists what was chosen, with its size", async () => {
    render(<FileUpload label="Add an image" onFilesChange={vi.fn()} />)

    await userEvent.upload(
      screen.getByLabelText(/Add an image/),
      aFile("logo.png", "image/png", 2048),
    )

    expect(screen.getByText("logo.png")).toBeInTheDocument()
    expect(screen.getByText("2 KB")).toBeInTheDocument()
  })

  it("keeps only the last file unless several are allowed", async () => {
    render(<FileUpload label="Add an image" onFilesChange={vi.fn()} />)
    const input = screen.getByLabelText(/Add an image/)

    await userEvent.upload(input, aFile("one.png", "image/png", 10))
    await userEvent.upload(input, aFile("two.png", "image/png", 10))

    expect(screen.queryByText("one.png")).not.toBeInTheDocument()
    expect(screen.getByText("two.png")).toBeInTheDocument()
  })

  it("keeps them all when several are allowed", async () => {
    render(<FileUpload label="Add images" multiple onFilesChange={vi.fn()} />)
    const input = screen.getByLabelText(/Add images/)

    await userEvent.upload(input, aFile("one.png", "image/png", 10))
    await userEvent.upload(input, aFile("two.png", "image/png", 10))

    expect(screen.getByText("one.png")).toBeInTheDocument()
    expect(screen.getByText("two.png")).toBeInTheDocument()
  })

  describe("validation", () => {
    it("rejects a file that is too large, naming the limit", async () => {
      // Said before the upload, not after: the reader should not wait to find
      // out the file was never going to be accepted.
      const onFilesChange = vi.fn()
      render(<FileUpload label="Add an image" maxSize={1024} onFilesChange={onFilesChange} />)

      await userEvent.upload(
        screen.getByLabelText(/Add an image/),
        aFile("huge.png", "image/png", 5000),
      )

      expect(screen.getByRole("alert")).toHaveTextContent("huge.png is larger than 1 KB.")
      expect(onFilesChange).toHaveBeenCalledWith([])
    })

    it("rejects a type that is not permitted, however it arrived", async () => {
      render(<FileUpload label="Add an image" accept="image/png" onFilesChange={vi.fn()} />)

      drop(aFile("notes.pdf", "application/pdf", 10))

      expect(screen.getByRole("alert")).toHaveTextContent("not a permitted file type")
      expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument()
    })

    it("understands a wildcard type", async () => {
      render(<FileUpload label="Add an image" accept="image/*" onFilesChange={vi.fn()} />)

      drop(aFile("logo.svg", "image/svg+xml", 10))

      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(screen.getByText("logo.svg")).toBeInTheDocument()
    })

    it("shows the limit before anything is chosen", () => {
      render(<FileUpload label="Add an image" maxSize={5 * 1024 * 1024} onFilesChange={vi.fn()} />)

      expect(screen.getByText("Up to 5 MB")).toBeInTheDocument()
    })
  })

  it("removes a file", async () => {
    const onFilesChange = vi.fn()
    render(<FileUpload label="Add an image" onFilesChange={onFilesChange} />)

    await userEvent.upload(
      screen.getByLabelText(/Add an image/),
      aFile("logo.png", "image/png", 10),
    )
    await userEvent.click(screen.getByRole("button", { name: "Remove logo.png" }))

    expect(screen.queryByText("logo.png")).not.toBeInTheDocument()
    expect(onFilesChange).toHaveBeenLastCalledWith([])
  })

  it("accepts a drop", async () => {
    const onFilesChange = vi.fn()
    render(<FileUpload label="Add an image" onFilesChange={onFilesChange} />)

    drop(aFile("dropped.png", "image/png", 10))

    expect(onFilesChange).toHaveBeenCalledTimes(1)
    expect(onFilesChange.mock.calls[0]?.[0]?.[0]?.name).toBe("dropped.png")
  })

  it("ignores a drop when disabled", () => {
    const onFilesChange = vi.fn()
    render(<FileUpload label="Add an image" disabled onFilesChange={onFilesChange} />)

    drop(aFile("dropped.png", "image/png", 10))

    expect(onFilesChange).not.toHaveBeenCalled()
  })

  it("accepts nothing when disabled", async () => {
    const onFilesChange = vi.fn()
    render(<FileUpload label="Add an image" disabled onFilesChange={onFilesChange} />)

    expect(screen.getByLabelText(/Add an image/)).toBeDisabled()
    expect(onFilesChange).not.toHaveBeenCalled()
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <FileUpload
        label="Add an image"
        description="PNG or JPEG"
        maxSize={1024}
        onFilesChange={vi.fn()}
      />,
    )

    await expectNoViolations(container)
  })
})
