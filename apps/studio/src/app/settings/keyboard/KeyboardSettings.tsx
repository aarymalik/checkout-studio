"use client"

import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Alert, Button, SearchInput, Switch, cn } from "@checkout-studio/ui"
import {
  DEFAULT_KEYMAP,
  bindingFromEvent,
  defaultShortcuts,
  explainRebinding,
  formatBinding,
  resolveShortcuts,
  shellCommandDescriptors,
  type CommandDescriptor,
  type KeyBinding,
  type Platform,
  type ScopeId,
  type UserKeymap,
} from "@checkout-studio/editor"
import { appCommandDescriptors } from "@/studio/commands"
import { send } from "@/lib/api-client"

/**
 * Settings → Keyboard.
 *
 * Three things, each required: remap a shortcut, switch single-character
 * shortcuts off (WCAG 2.1.4), and put everything back. It doubles as the
 * searchable reference, because the list it shows is the keymap itself rather
 * than a description of one that can drift from it.
 *
 * A rebinding is refused with a reason rather than accepted and ignored —
 * silently dropping a change is how somebody concludes a setting is broken.
 *
 * See docs/keyboard-shortcuts.md § Customization.
 */

const SCOPE_TITLES: Partial<Record<ScopeId, string>> = {
  global: "Anywhere",
  studio: "Editor",
  canvas: "Canvas",
  layers: "Layers",
  inspector: "Inspector",
}

const DESCRIPTORS: readonly CommandDescriptor[] = [
  ...shellCommandDescriptors,
  ...appCommandDescriptors,
]

const TITLES = new Map(DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]))

/** A command in a scope, as one string. Overrides are keyed by the pair. */
function keyOf(commandId: string, scope: ScopeId): string {
  return `${commandId}\u0000${scope}`
}

interface Row {
  commandId: string
  scope: ScopeId
  title: string
  keywords: readonly string[]
  /**
   * Every key that runs this command here.
   *
   * Usually one. A couple ship with two spellings — the reference sheet is ⌘/
   * and also plain ? — and both belong on one row, because changing the shortcut
   * changes the shortcut rather than one of its two names.
   */
  bindings: readonly KeyBinding[]
  /** Whether somebody has changed this one. */
  changed: boolean
}

export function KeyboardSettings({
  initialKeymap,
  platform,
}: {
  initialKeymap: UserKeymap
  /**
   * Which modifier to show, from the request.
   *
   * Not detected here: this component renders on the server first, where there
   * is no browser to ask, and a label that says Ctrl until hydration corrects it
   * to ⌘ is a label that was wrong.
   */
  platform: Platform
}) {
  const [keymap, setKeymap] = useState(initialKeymap)
  const [search, setSearch] = useState("")
  const [capturing, setCapturing] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const active = useMemo(() => resolveShortcuts(defaultShortcuts, keymap), [keymap])

  const rows = useMemo<Row[]>(() => {
    const bindings = new Map<string, KeyBinding[]>()

    for (const registration of active) {
      const key = keyOf(registration.commandId, registration.scope)
      bindings.set(key, [...(bindings.get(key) ?? []), registration.binding])
    }

    const changed = new Set(
      keymap.overrides.map((override) => keyOf(override.commandId, override.scope)),
    )

    // Driven by what the product ships rather than by what is active, so a
    // switched-off shortcut still has a row to switch back on.
    const seen = new Set<string>()

    return defaultShortcuts.flatMap((shipped) => {
      const descriptor = TITLES.get(shipped.commandId)
      const key = keyOf(shipped.commandId, shipped.scope)

      if (descriptor === undefined || seen.has(key)) return []

      seen.add(key)

      return [
        {
          commandId: shipped.commandId,
          scope: shipped.scope,
          title: descriptor.title,
          keywords: descriptor.keywords ?? [],
          bindings: bindings.get(key) ?? [],
          changed: changed.has(key),
        },
      ]
    })
  }, [active, keymap.overrides])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (needle === "") return rows

    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(needle) ||
        row.keywords.some((keyword) => keyword.includes(needle)) ||
        row.bindings.some((binding) =>
          formatBinding(binding, platform).toLowerCase().includes(needle),
        ),
    )
  }, [rows, search, platform])

  async function store(next: UserKeymap): Promise<void> {
    setSaving(true)
    setKeymap(next)

    const result = await send("/api/preferences/keyboard.keymap", "PUT", { value: next })

    setSaving(false)

    if (!result.ok) {
      // Put it back: a setting that appears to have saved and has not is worse
      // than one that says it failed.
      setKeymap(keymap)
      setProblem(result.message)
    }
  }

  function override(commandId: string, scope: ScopeId, binding: KeyBinding | null): UserKeymap {
    return {
      ...keymap,
      overrides: [...forget(commandId, scope).overrides, { commandId, scope, binding }],
    }
  }

  /** Drop an override, so the shipped shortcut applies again. */
  function forget(commandId: string, scope: ScopeId): UserKeymap {
    return {
      ...keymap,
      overrides: keymap.overrides.filter(
        (entry) => entry.commandId !== commandId || entry.scope !== scope,
      ),
    }
  }

  function capture(row: Row, event: React.KeyboardEvent): void {
    event.preventDefault()

    if (event.key === "Escape") {
      setCapturing(null)
      return
    }

    // A modifier on its own is somebody part-way through a combination.
    if (/^(Shift|Control|Alt|Meta|CapsLock)/.test(event.code)) return

    const binding = bindingFromEvent(event.nativeEvent, platform)
    const refusal = explainRebinding(binding, row.scope, active, row.commandId)

    if (refusal !== null) {
      setProblem(refusal)
      return
    }

    setProblem(null)
    setCapturing(null)
    void store(override(row.commandId, row.scope, binding))
  }

  const grouped = useMemo(() => {
    const byScope = new Map<ScopeId, Row[]>()

    for (const row of visible) {
      byScope.set(row.scope, [...(byScope.get(row.scope) ?? []), row])
    }

    return [...byScope.entries()]
  }, [visible])

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 font-semibold text-foreground">Keyboard</h1>
        <p className="text-body text-foreground-muted">
          Every shortcut the editor knows about. Click one to change it, or switch it off.
        </p>
      </div>

      {problem === null ? null : (
        <Alert variant="danger" title="That key cannot be used">
          {problem}
        </Alert>
      )}

      <SearchInput
        label="Search shortcuts"
        labelHidden
        placeholder="Search by name or by key"
        value={search}
        onValueChange={setSearch}
      />

      {/*
       * WCAG 2.1.4. A shortcut that is a single character with no modifier can
       * be triggered by speech input: dictating a sentence into a page that
       * binds "S" inserts a section. This is the switch that success criterion
       * requires.
       */}
      <div className="rounded-card border border-border bg-surface p-4">
        <Switch
          label="Single-character shortcuts"
          description="Keys with no modifier, like ?. Switch them off if you use speech input, so dictation cannot trigger them."
          checked={keymap.characterKeysEnabled}
          disabled={saving}
          onCheckedChange={(checked) => void store({ ...keymap, characterKeysEnabled: checked })}
        />
      </div>

      {grouped.length === 0 ? (
        <p className="text-body text-foreground-muted">No shortcut matches that.</p>
      ) : (
        grouped.map(([scope, scopeRows]) => (
          <section key={scope} className="flex flex-col gap-2">
            <h2 className="text-caption font-medium tracking-wide text-foreground-muted uppercase">
              {SCOPE_TITLES[scope] ?? scope}
            </h2>

            <ul className="flex flex-col rounded-card border border-border bg-surface">
              {scopeRows.map((row) => {
                const id = keyOf(row.commandId, row.scope)
                const isCapturing = capturing === id
                const label =
                  row.bindings.length === 0
                    ? "Off"
                    : row.bindings.map((binding) => formatBinding(binding, platform)).join(" or ")

                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body text-foreground">{row.title}</span>
                      {row.changed ? (
                        <span className="text-caption text-foreground-subtle">Changed</span>
                      ) : null}
                    </span>

                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        aria-label={
                          isCapturing
                            ? `Press a new shortcut for ${row.title}, or Escape to cancel`
                            : `Change the shortcut for ${row.title}`
                        }
                        onClick={() => {
                          setProblem(null)
                          setCapturing(isCapturing ? null : id)
                        }}
                        onKeyDown={(event) => {
                          if (isCapturing) capture(row, event)
                        }}
                        className={cn(
                          "h-control-sm rounded-control border px-3 font-code text-caption",
                          "transition-colors duration-fast ease-standard",
                          "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
                          isCapturing
                            ? "border-primary bg-primary-subtle text-primary"
                            : "border-border-strong text-foreground hover:bg-surface-hover",
                        )}
                      >
                        {isCapturing ? "Press a key…" : label}
                      </button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() =>
                          void store(
                            row.bindings.length === 0
                              ? forget(row.commandId, row.scope)
                              : override(row.commandId, row.scope, null),
                          )
                        }
                      >
                        {row.bindings.length === 0 ? "Restore" : "Switch off"}
                      </Button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      <div className="flex justify-end">
        <Button
          variant="secondary"
          disabled={saving || (keymap.overrides.length === 0 && keymap.characterKeysEnabled)}
          onClick={() => void store(DEFAULT_KEYMAP)}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Reset all shortcuts
        </Button>
      </div>
    </main>
  )
}
