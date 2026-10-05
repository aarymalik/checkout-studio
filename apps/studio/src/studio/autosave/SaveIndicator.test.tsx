import { act, render, screen } from "@testing-library/react"
import { EditorProvider, useEditorStoreApi, type EditorStoreApi } from "@checkout-studio/editor"
import { createDocument } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { SaveIndicator } from "./SaveIndicator"

/**
 * What autosave is doing, as the status bar says it.
 *
 * The state that matters is the failure: somebody who closes a tab believing
 * their work reached the server has lost it, and this is the only thing that
 * would have told them otherwise.
 */

function setup(): { store: EditorStoreApi } {
  let captured: EditorStoreApi | null = null

  function Capture(): ReactElement {
    captured = useEditorStoreApi()

    return <SaveIndicator />
  }

  const document = createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
  })

  render(
    <EditorProvider document={document} baseVersion={1}>
      <Capture />
    </EditorProvider>,
  )

  if (captured === null) throw new Error("The provider did not render.")

  return { store: captured }
}

function label(): string {
  return screen.getByRole("status").textContent ?? ""
}

describe("SaveIndicator", () => {
  it("says a freshly loaded page is saved, because it is", () => {
    setup()

    // The draft on screen is the draft on the server. Claiming a time would be
    // inventing one for every session that has not edited anything.
    expect(label()).toBe("Saved")
  })

  it("says an edited page has changes that are not on the server", () => {
    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    expect(label()).toBe("Unsaved changes")
  })

  it("says when a save is in flight", () => {
    const { store } = setup()

    act(() => {
      store.getState().markSaving()
    })

    expect(label()).toBe("Saving…")
  })

  it("says a save failed, and why", () => {
    const { store } = setup()

    act(() => {
      store.getState().markSaveFailed("This page was changed in another session.")
    })

    // "Not saved" alone tells somebody to worry without telling them what
    // about, and the reasons call for different responses.
    expect(label()).toContain("Not saved")
    expect(label()).toContain("This page was changed in another session.")
  })

  it("stops saying it failed once a save succeeds", () => {
    const { store } = setup()

    act(() => {
      store.getState().markSaveFailed("Offline.")
    })
    act(() => {
      store.getState().markSaved(2)
    })

    expect(label()).toBe("Saved")
  })

  it("is a polite live region rather than an alert", () => {
    const { store } = setup()

    act(() => {
      store.getState().markSaving()
    })

    // A save that interrupts somebody mid-sentence is worse than one nobody
    // notices.
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
