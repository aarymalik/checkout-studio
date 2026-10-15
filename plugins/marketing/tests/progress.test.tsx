import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { progressBar } from "../src/components/progress-bar/definition"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

function bar(): HTMLElement {
  return screen.getByRole("progressbar")
}

function width(): string {
  return (document.querySelector(".ck-progress-fill") as HTMLElement).style.width
}

describe("a progress bar", () => {
  it("says where it is, in the terms it was given", () => {
    renderComponent(progressBar, { props: { value: 2, max: 3, label: "Step 2 of 3" } })

    expect(bar()).toHaveAttribute("aria-valuenow", "2")
    expect(bar()).toHaveAttribute("aria-valuemin", "0")
    expect(bar()).toHaveAttribute("aria-valuemax", "3")
    expect(bar()).toHaveAccessibleName("Step 2 of 3")
  })

  it("fills the share of the track the numbers describe", () => {
    renderComponent(progressBar, { props: { value: 1, max: 4, label: "x" } })

    expect(width()).toBe("25%")
  })

  it("cannot be more than full", () => {
    // A value above the maximum would draw a bar wider than its track.
    renderComponent(progressBar, { props: { value: 9, max: 3, label: "x" } })

    expect(width()).toBe("100%")
    expect(bar()).toHaveAttribute("aria-valuenow", "3")
  })

  it("cannot be less than empty", () => {
    renderComponent(progressBar, { props: { value: -5, max: 10, label: "x" } })

    expect(width()).toBe("0%")
    expect(bar()).toHaveAttribute("aria-valuenow", "0")
  })

  it("survives a maximum of nothing", () => {
    // Dividing by it is the obvious way to put NaN into a style attribute.
    renderComponent(progressBar, { props: { value: 1, max: 0, label: "x" } })

    expect(width()).not.toContain("NaN")
    expect(width()).toBe("100%")
  })

  it.each([
    ["a string", "half"],
    ["nothing", undefined],
    ["something that is not a number", {}],
  ])("falls back when the value is %s", (_name, value) => {
    renderComponent(progressBar, { props: { value, max: 100, label: "x" } })

    expect(width()).toBe("0%")
  })

  it("is named for a screen reader even when the words are not drawn", () => {
    /*
     * Hiding the label hides it from the eyes, not from the bar. A progress
     * bar announced as "progress bar, 60 percent" of nothing in particular is
     * a number with no subject.
     */
    renderComponent(progressBar, {
      props: { value: 3, max: 5, label: "Step 3 of 5", showLabel: false },
    })

    expect(screen.queryByText("Step 3 of 5")).toBeNull()
    expect(bar()).toHaveAccessibleName("Step 3 of 5")
  })

  it("shows the label beneath it when asked", () => {
    renderComponent(progressBar, { props: { value: 3, max: 5, label: "Step 3 of 5" } })

    expect(screen.getByText("Step 3 of 5")).toBeVisible()
  })

  it("ships no JavaScript", () => {
    expect(progressBar.interactive).toBe(false)
  })

  it("reports nothing to axe", async () => {
    const { container } = renderComponent(progressBar)

    await expectNoViolations(container)
  })
})
