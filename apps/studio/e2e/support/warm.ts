import type { FullConfig } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies } from "./account"
import { createPage } from "./page"

/**
 * Compiles the routes before any test interacts with one.
 *
 * ## The flakiness this is for
 *
 * A development server compiles a route the first time it is asked for, and
 * CI runs on two cores. The first test to reach a route pays for that, and
 * what it pays with is the window between the page being interactive and the
 * test acting on it: three specs have been intermittently red in CI and all
 * three are the first interaction with a freshly compiled route — a wheel
 * event that arrived before anything listened, a pointer move that arrived
 * before a gesture was live, and the only test that visits the project route
 * with no page open.
 *
 * Waiting longer in each test would hide it behind a number somebody has to
 * keep raising. Asking for each route once, before the suite, means no test
 * is the first.
 *
 * ## It asks over HTTP rather than in a browser
 *
 * What is slow is the server compiling the route, and a request is enough to
 * make it do that. Driving a browser here would mean a second kind of setup
 * to keep working, for the part that was already fast.
 *
 * The fixtures it needs are made and removed again: a warm-up that left an
 * account behind would be a row every test run adds to a database nothing
 * clears.
 */
export default async function warm(config: FullConfig): Promise<void> {
  /*
   * The address the suite will use, taken from the config rather than worked
   * out again from `APP_URL`. Playwright starts the web server before this
   * runs, and on whichever port the config chose — re-deriving it here would
   * be a second place for that decision to live and a warm-up that quietly
   * warmed nothing.
   */
  const base = config.projects[0]?.use.baseURL

  if (base === undefined) throw new Error("The suite has no base URL to warm.")

  const account = await createAccount("warm")

  try {
    const pageId = await createPage(account.projectId, {
      title: "Warm",
      slug: `warm-${Date.now().toString(36)}`,
      nodes: [{ id: "warm_section", type: "core.section", name: "Hero" }],
    })

    const cookie = (await signedInCookies(account))
      .map((one) => `${one.name}=${one.value}`)
      .join("; ")

    /*
     * Every route a spec opens. The project route twice, because the one
     * without a page is a different branch of the shell — it renders no
     * store at all — and it is the test that has been flaky in every run.
     */
    for (const path of [
      "/",
      "/projects",
      `/projects/${account.projectId}`,
      `/projects/${account.projectId}?page=${pageId}`,
    ]) {
      const response = await fetch(`${base}${path}`, { headers: { cookie } })

      // Read it, because a body nobody consumes can leave the server still
      // writing while the next request arrives.
      await response.text()
    }
  } finally {
    await removeAccount(account)
  }
}
