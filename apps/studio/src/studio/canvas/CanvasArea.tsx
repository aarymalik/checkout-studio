"use client"

import { EmptyState } from "@checkout-studio/ui"
import { useKeyboard } from "@checkout-studio/editor"
import type { CheckoutTheme } from "@checkout-studio/schema"
import type { PluginRecord, RendererRegistry } from "@checkout-studio/plugin-sdk"
import type { ReactElement, ReactNode } from "react"

import { Canvas } from "./Canvas"
import { host, registry as shippedRegistry } from "@/studio/registry"

/**
 * The canvas, or the reason there isn't one.
 *
 * Two reasons, and they are different problems with different answers.
 *
 * A project with **no pages** has nothing to draw, and drawing an empty frame
 * would suggest the page exists and is blank.
 *
 * **No components registered** is not a page problem at all: the document is
 * fine and there is nothing in the product that knows how to draw it. Saying so
 * once belongs here, because the alternative is the renderer repeating a
 * per-node "this plugin is not installed" for every node on the page — which
 * describes the wrong problem, and describes it N times.
 *
 * That second state used to mean "Phase 9 has not happened yet". Now that the
 * core plugins exist it means a plugin did not activate, so it says which one
 * and what went wrong — the host already knows, and a blank canvas that keeps
 * the reason to itself is the worst version of this.
 *
 * The landmark is the same in every case, so the keyboard reaches this region
 * whether or not there is anything in it.
 */
export function CanvasArea({
  theme,
  registry = shippedRegistry,
  plugins = host.records(),
}: {
  theme: CheckoutTheme | null
  /** The build's own, unless a test is asking what an empty one looks like. */
  registry?: RendererRegistry
  plugins?: readonly PluginRecord[]
}): ReactElement {
  const { keymap, platform } = useKeyboard()

  // The page first, because it is the one the user can do something about.
  // Being told the component library is unfinished before being told to create
  // a page answers a question they have not reached yet.
  if (theme === null) {
    const binding = keymap.bindingFor("help.command-palette")

    return (
      <Region>
        <EmptyState
          title="No page open"
          description={
            binding === null
              ? "Create a page to start building."
              : `Create a page to start building. ${keymap.format(binding, platform)} reaches everything the studio can do.`
          }
        />
      </Region>
    )
  }

  // Read at render: a registry is built at startup from the plugins in this
  // build, and does not change while somebody is looking at it.
  if (registry.types().length === 0) {
    return (
      <Region>
        <EmptyState title="No components yet" description={whyNothingIsRegistered(plugins)} />
      </Region>
    )
  }

  return <Canvas theme={theme} registry={registry} />
}

/**
 * The reason there is nothing to draw with, in the user's terms.
 *
 * A plugin that failed to activate is the likely cause and the only one anybody
 * can act on, so it is named. The host records what went wrong per plugin
 * precisely so that this does not have to guess.
 */
function whyNothingIsRegistered(plugins: readonly PluginRecord[]): string {
  const broken = plugins.filter(
    (record) => record.state === "failed" || record.state === "disabled",
  )

  if (broken.length === 0) {
    return "No plugin in this build registered any components, so there is nothing that knows how to draw a page. Pages, the canvas and the keyboard all work."
  }

  const reasons = broken
    .map((record) => `${record.manifest.name}: ${record.problem?.message ?? "no reason recorded"}`)
    .join(" · ")

  return `The components come from plugins, and one did not load. ${reasons}`
}

/** The landmark, which exists whether or not there is a canvas inside it. */
function Region({ children }: { children: ReactNode }): ReactElement {
  return (
    <main
      id="shell-canvas"
      tabIndex={-1}
      aria-label="Canvas"
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-canvas p-8"
    >
      {children}
    </main>
  )
}
