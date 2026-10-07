import { expect, test, type Page } from "@playwright/test"

/**
 * The canvas, measured.
 *
 * Phase 7's exit criteria are numbers: sixty frames a second while panning and
 * zooming two thousand nodes, selection feedback inside sixteen milliseconds,
 * the layers panel under a hundred. jsdom can answer none of that — it has no
 * layout and no frames — so this drives a real browser against the bench
 * harness.
 *
 * Reported as well as asserted. A benchmark that only says pass or fail tells
 * you nothing on the day it starts drifting, so every measurement is printed.
 *
 * ## What the first version of this measured, and why it was wrong
 *
 * It recorded the interval between animation frames and compared the 95th
 * percentile against 16.67ms. That number cannot mean what it was taken to
 * mean. On a 60Hz display frames *arrive* every 16.7ms however idle the page
 * is, so the percentile of the interval is a property of the display, not of
 * the canvas. Measured here: a page with no input at all scores a p95 of
 * 17.4ms, and panning two thousand nodes scores 17.5ms. The first version
 * reported that as "the pan criterion is not met" when what it had found was
 * the refresh rate.
 *
 * So the interval is now used for the one thing it does say: whether a frame
 * was *missed*. A browser that cannot finish in time does not return a slightly
 * larger interval, it skips a vsync and returns roughly double. Everything else
 * is measured as the cost a gesture *adds* to an idle frame, which is the
 * quantity the 16.67ms budget is actually about — how much of a frame's working
 * time the gesture consumes.
 *
 * Every test therefore calibrates against its own idle page first, in the same
 * browser on the same machine, seconds apart. That also makes the numbers
 * meaningful on a 120Hz laptop or a throttled runner, where a hardcoded 16.67
 * would be wrong in both directions.
 */

/**
 * The recorder's own state, which lives in the page because that is where the
 * frames are. Separate from `__bench`, which the harness owns.
 */
declare global {
  interface Window {
    __benchFrames?: number[]
    __benchRecording?: boolean
  }
}

const NODES = 2_000

/** 60 FPS is 16.67ms a frame. Phase 7 § Performance. */
const FRAME_BUDGET_MS = 16.67

/** Phase 7 § Performance: selection change under 16ms. */
const SELECTION_BUDGET_MS = 16

/** Enough of them that the median is a measurement rather than a coin toss. */
const SELECTION_SAMPLES = 40

/** Phase 7 § Performance: the layers panel with 2,000 nodes under 100ms. */
const PANEL_BUDGET_MS = 100

/**
 * A frame longer than this multiple of the display's period was missed.
 *
 * A browser that overruns does not deliver a frame late, it waits for the next
 * vsync — so a missed frame measures near twice the period and an on-time one
 * near once. Halfway between separates them with the most room for noise on
 * either side.
 */
const MISSED_FRAME_RATIO = 1.5

/*
 * Ratchets, set just above where the canvas measures today.
 *
 * Asserted, unlike the budgets, which are printed. The distinction matters:
 * a budget is what the phase asks for, and a ceiling is what stops a
 * regression. Lower one when the canvas gets faster; never raise one to make a
 * run green.
 *
 * Checked against the regression they exist for rather than assumed to work.
 * With the memoisation of the rendered page removed — the real 31ms frame this
 * benchmark found when it was first written — all three of the timing
 * measurements below fail: one missed frame of 42 panning, 21 of 88 zooming
 * with 9.6ms added, and a selection median of 6ms. The metric this replaced
 * caught two of those three.
 */
const PAN_ADDED_CEILING_MS = 3
const ZOOM_ADDED_CEILING_MS = 4

/**
 * Set from what it measures, which is the whole point of having measured it.
 *
 * A sustained drag adds 0.3ms: resolving a drop is 0.3ms at two thousand nodes
 * and checking whether it is legal is 0.003ms, both measured directly, and the
 * preview moves by a transform on a promoted layer. The first guess at this
 * constant was 6ms, written before there was a number — the same mistake #31
 * was about.
 */
const DRAG_ADDED_CEILING_MS = 3

/*
 * Selection is held to its median, not its 95th percentile.
 *
 * Not a softening — the opposite. The latency from writing the selection to the
 * overlay changing includes React committing, which its scheduler may do in the
 * same task or after the frame already in flight. That makes the tail a
 * property of when the write landed relative to a frame boundary: over six runs
 * the p95 wandered between 3.9 and 5.3ms while the median stayed inside half a
 * millisecond. A ceiling has to sit above the worst tail to be usable, and by
 * then it is above the cost it was meant to catch — the regression above
 * reaches a median of 6ms and a p95 of 10.7ms, so only the median separates
 * them. The p95 is printed beside it.
 */
const SELECTION_CEILING_MS = 4

interface Frames {
  /** The display's period: the median interval of an idle page. */
  period: number
  p95: number
  missed: number
  total: number
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] as number
}

/** Frame intervals while `drive` runs, measured by the browser itself. */
async function frameIntervals(page: Page, drive: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => {
    const frames: number[] = []
    let previous = performance.now()

    const tick = (): void => {
      const now = performance.now()

      frames.push(now - previous)
      previous = now

      if (window.__benchRecording === true) requestAnimationFrame(tick)
    }

    window.__benchFrames = frames
    window.__benchRecording = true
    requestAnimationFrame(tick)
  })

  await drive()

  return page.evaluate(() => {
    window.__benchRecording = false

    // The first interval spans the gap before the gesture began.
    return (window.__benchFrames ?? []).slice(1)
  })
}

/**
 * What the machine does when nothing is asked of it.
 *
 * Taken in the same page as the gesture it is compared against, because this
 * is the quantity everything else is measured relative to — a baseline from
 * another run, or from another machine, would not be a baseline.
 */
async function idle(page: Page): Promise<Frames> {
  const intervals = await frameIntervals(page, () => page.waitForTimeout(1_200))
  const period = percentile(intervals, 0.5)

  return {
    period,
    p95: percentile(intervals, 0.95),
    missed: intervals.filter((interval) => interval > period * MISSED_FRAME_RATIO).length,
    total: intervals.length,
  }
}

function summarise(intervals: readonly number[], baseline: Frames): Frames {
  return {
    period: baseline.period,
    p95: percentile(intervals, 0.95),
    missed: intervals.filter((interval) => interval > baseline.period * MISSED_FRAME_RATIO).length,
    total: intervals.length,
  }
}

/**
 * Starting a gesture and sustaining one, measured apart.
 *
 * "Sustains 60 FPS" is a claim about the second. A gesture that mounts
 * something on its first frame pays for that once, and over a short recording
 * that one frame is the 95th percentile — which is how the drag came to report
 * 11.7ms of added work that turned out to be 0.3ms once the recording was long
 * enough to tell them apart.
 *
 * Both are printed. A hitch at pickup is worth seeing; it is not worth calling
 * a dropped frame rate.
 */
const STARTUP_FRAMES = 5

function sustained(intervals: readonly number[], baseline: Frames): Frames {
  return summarise(intervals.slice(STARTUP_FRAMES), baseline)
}

function report(name: string, value: number, budget: number, unit = "ms", note = ""): void {
  const verdict = value <= budget ? "ok" : "OVER BUDGET"
  const against = note === "" ? `budget ${budget}${unit}` : `ceiling ${budget}${unit}, ${note}`

  console.log(`  ${name.padEnd(42)} ${value.toFixed(2)}${unit} (${against}) ${verdict}`)
}

/**
 * Everything a gesture's frames say, printed together so drift is visible.
 *
 * The added work is printed against its ceiling rather than against the frame
 * budget, because a share of a frame is not a frame: the first version of this
 * printed "9.60ms (budget 16.67ms) ok" for a gesture that had just missed
 * twenty-one frames out of eighty-eight. Whether sixty frames a second is held
 * is what the missed count answers; how much of a frame the gesture costs is
 * what the added work answers. Two questions, two lines.
 */
function reportFrames(name: string, gesture: Frames, baseline: Frames, ceiling: number): void {
  console.log(
    `  ${`${name}: display period`.padEnd(42)} ${baseline.period.toFixed(2)}ms` +
      ` (idle p95 ${baseline.p95.toFixed(2)}ms over ${baseline.total} frames)`,
  )
  console.log(
    `  ${`${name}: frames missed`.padEnd(42)} ${gesture.missed} of ${gesture.total}` +
      ` (over ${(baseline.period * MISSED_FRAME_RATIO).toFixed(2)}ms)` +
      ` ${gesture.missed === 0 ? "ok" : "FRAMES DROPPED"}`,
  )
  report(
    `${name}: work added to a frame`,
    gesture.p95 - baseline.p95,
    ceiling,
    "ms",
    `of a ${FRAME_BUDGET_MS}ms frame`,
  )
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/bench/canvas?nodes=${NODES}&${query}`)

  // The harness publishes the store once it is mounted, which is also the
  // signal that the document is in and the canvas has rendered it.
  await page.waitForFunction(() => window.__bench !== undefined)
  await expect(page.locator("[data-canvas-frame]")).toBeVisible()

  // Let the first paint settle, so the first gesture is not measured against it.
  await page.waitForTimeout(500)
}

test("pan sustains the frame budget at 2,000 nodes", async ({ page }) => {
  await open(page, "panel=0")

  const surface = page.getByRole("main", { name: "Canvas" })

  await surface.hover()

  const baseline = await idle(page)
  const intervals = await frameIntervals(page, async () => {
    await page.keyboard.down("Space")
    await page.mouse.down()

    for (let step = 0; step < 40; step += 1) {
      await page.mouse.move(400 + step * 8, 300 + step * 4)
    }

    await page.mouse.up()
    await page.keyboard.up("Space")
  })

  const panning = summarise(intervals, baseline)

  reportFrames("pan", panning, baseline, PAN_ADDED_CEILING_MS)
  expect(panning.total).toBeGreaterThan(10)
  expect(panning.missed).toBe(0)
  expect(panning.p95 - baseline.p95).toBeLessThanOrEqual(PAN_ADDED_CEILING_MS)
})

test("zoom sustains the frame budget at 2,000 nodes", async ({ page }) => {
  await open(page, "panel=0")

  await page.getByRole("main", { name: "Canvas" }).hover()

  const baseline = await idle(page)
  const intervals = await frameIntervals(page, async () => {
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.down("Control")
      await page.mouse.wheel(0, step % 2 === 0 ? -60 : 60)
      await page.keyboard.up("Control")
    }
  })

  const zooming = summarise(intervals, baseline)

  reportFrames("zoom", zooming, baseline, ZOOM_ADDED_CEILING_MS)
  expect(zooming.total).toBeGreaterThan(10)
  expect(zooming.missed).toBe(0)
  expect(zooming.p95 - baseline.p95).toBeLessThanOrEqual(ZOOM_ADDED_CEILING_MS)
})

test("drag sustains the frame budget at 2,000 nodes", async ({ page }) => {
  await open(page, "panel=0")

  /*
   * Measured because the criterion exists, and because a drag does more per
   * frame than anything else the canvas does: it resolves a drop against the
   * document, asks whether that drop is legal, draws an indicator, and carries
   * a preview that is a live render of the dragged subtree. Phase 8 asks for 60
   * FPS during a drag on two thousand nodes, and the version of this file that
   * shipped before #31 would have reported the display's refresh rate and
   * called it an answer.
   */
  const box = await page.evaluate(() => {
    const bench = window.__bench

    if (bench === undefined) throw new Error("The harness did not publish its store.")

    const id = bench.nodes[0] as string

    bench.store.getState().select([id])

    const element = document
      .querySelector("[data-canvas-frame]")
      ?.querySelector(`[data-ck-node="${id}"]`)

    if (element === null || element === undefined) throw new Error("The node drew nothing.")

    const rect = element.getBoundingClientRect()

    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })

  const baseline = await idle(page)

  await page.mouse.move(box.x, box.y)
  await page.mouse.down()

  const intervals = await frameIntervals(page, async () => {
    // Downwards across its siblings, which is what a reorder is: every step
    // resolves against a different target.
    for (let step = 0; step < 100; step += 1) {
      await page.mouse.move(box.x, box.y + (step % 40) * 12)
    }
  })

  await page.mouse.up()

  const whole = summarise(intervals, baseline)
  const moving = sustained(intervals, baseline)

  console.log(
    `  ${"drag: starting it".padEnd(42)} ${whole.missed - moving.missed} frame(s) missed` +
      ` in the first ${STARTUP_FRAMES}, as the preview mounts`,
  )
  reportFrames("drag", moving, baseline, DRAG_ADDED_CEILING_MS)

  expect(moving.total).toBeGreaterThan(40)
  // Sustained, which is what the criterion says. The pickup is printed above.
  expect(moving.missed).toBe(0)
  expect(moving.p95 - baseline.p95).toBeLessThanOrEqual(DRAG_ADDED_CEILING_MS)
})

test("a selection change reaches the overlay within its budget", async ({ page }) => {
  await open(page, "panel=0")

  /*
   * Measured to the overlay, not to the next frame.
   *
   * The first version of this waited on `requestAnimationFrame` after writing
   * the selection, which meant most of what it reported was the wait for the
   * next vsync — the same mistake as the frame-interval metric, and the reason
   * it read 17ms against a 16ms budget while doing almost no work.
   *
   * What the criterion is about is when the user sees the outline move, so the
   * clock stops when the overlay layer's DOM changes rather than on the next
   * frame. That is work and scheduling instead of waiting — but not purely
   * work, which is why the median rather than the tail is what gets asserted:
   * React's scheduler may commit in the same task or behind the frame already
   * in flight, and which of those happened depends on when the write landed.
   */
  const samples = await page.evaluate(async (count: number) => {
    const bench = window.__bench

    if (bench === undefined) throw new Error("The harness did not publish its store.")

    const overlays = document.querySelector("[data-canvas-overlays]")

    if (overlays === null) throw new Error("The canvas has no overlay layer.")

    const measured: number[] = []

    for (let index = 0; index < count; index += 1) {
      const id = bench.nodes[(index * 7) % bench.nodes.length] as string
      const started = performance.now()
      const drawn = new Promise<number>((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect()
          resolve(performance.now() - started)
        })

        observer.observe(overlays, { childList: true, subtree: true, attributes: true })
      })

      bench.store.getState().select([id])
      measured.push(await drawn)

      // Clear of the next measurement, so one selection's overlay work is not
      // attributed to the following one.
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }

    return measured
  }, SELECTION_SAMPLES)

  const median = percentile(samples, 0.5)

  report("selection change to overlay (median)", median, SELECTION_BUDGET_MS)
  report("selection change to overlay (p95)", percentile(samples, 0.95), SELECTION_BUDGET_MS)
  expect(samples).toHaveLength(SELECTION_SAMPLES)
  expect(median).toBeLessThanOrEqual(SELECTION_CEILING_MS)
})

test("moving one node does not re-render the whole canvas", async ({ page }) => {
  await open(page, "panel=0")

  const kept = await page.evaluate(() => {
    const bench = window.__bench

    if (bench === undefined) throw new Error("The harness did not publish its store.")

    const frame = document.querySelector("[data-canvas-frame]")

    if (frame === null) throw new Error("The canvas has no frame.")

    /*
     * Identity, not count.
     *
     * React reuses the DOM it already has when a render produces the same
     * elements, so the question "did the canvas re-render" is really "are these
     * the same nodes as before". Sampling a hundred of them across the page is
     * enough to tell a targeted update from a wholesale one.
     */
    const sampled = [...frame.querySelectorAll("[data-ck-node]")].filter(
      (_, index) => index % 20 === 0,
    )

    const id = bench.nodes[bench.nodes.length - 1] as string

    bench.store.getState().rename(id, "Renamed by the benchmark")

    return sampled.filter((element) => element.isConnected).length / sampled.length
  })

  report("sampled nodes surviving one edit", kept * 100, 100, "%")

  // Every sampled element still in the document: the edit touched one node's
  // props, and nothing else had any reason to be replaced.
  expect(kept).toBe(1)
})

test("the layers panel renders 2,000 nodes within its budget", async ({ page }) => {
  await open(page, "panel=1")

  await expect(page.getByRole("tree", { name: "Layers" })).toBeVisible()

  const rows = await page.locator('[role="treeitem"]').count()

  /*
   * Measured in the browser rather than from the navigation, which would
   * include the server render and the bundle.
   *
   * To the rows changing, not to `scrollTo` returning. The first version of
   * this stopped the clock on the call and reported numbers between 0.00 and
   * 1.60ms for identical code — because a scroll is handled asynchronously, so
   * what it timed was the request, not the rebuild. A measurement that cannot
   * fail is not a measurement, which is the same mistake this file's other
   * metrics were corrected for.
   */
  const measured = await page.evaluate(async () => {
    const tree = document.querySelector('[role="tree"]')

    if (tree === null) throw new Error("The layers panel did not render.")

    const scroller = tree.closest("[data-radix-scroll-area-viewport]")

    if (scroller === null) throw new Error("The layers panel has no scroller.")

    // A scroll is the panel's most expensive ordinary operation: it rebuilds
    // the window and every row in it.
    const started = performance.now()
    const rebuilt = new Promise<number>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        observer.disconnect()
        resolve(performance.now() - started)
      })

      observer.observe(tree, { childList: true, subtree: true })
      setTimeout(() => {
        observer.disconnect()
        reject(new Error("Scrolling the layers panel rebuilt no rows."))
      }, 5_000)
    })

    scroller.scrollTo({ top: 4_000 })

    return rebuilt
  })

  report("layers panel window rebuild", measured, PANEL_BUDGET_MS)
  console.log(`  ${"rows rendered of 2,000".padEnd(44)} ${rows}`)

  // Virtualized: a window, not the document.
  expect(rows).toBeGreaterThan(0)
  expect(rows).toBeLessThan(200)
  expect(measured).toBeLessThanOrEqual(PANEL_BUDGET_MS)
})
