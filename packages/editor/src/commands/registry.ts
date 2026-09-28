import type { Command, EditorContext } from "./types"

/**
 * The command registry.
 *
 * One place that knows every command, so the palette, the keyboard dispatcher,
 * the toolbar and the context menus all read from the same list. A toolbar
 * button whose command is not registered simply does not render — which is how
 * an unbuilt feature stays absent rather than arriving as a button that does
 * nothing.
 */
export class CommandRegistryError extends Error {
  override readonly name = "CommandRegistryError"
}

export class CommandRegistry {
  private readonly commands = new Map<string, Command>()

  /**
   * Adds a command.
   *
   * A duplicate id throws rather than replacing. Two features quietly sharing
   * an id is a bug that shows up as the wrong thing happening on a keystroke,
   * long after whoever caused it has moved on.
   */
  register(command: Command): { dispose: () => void } {
    if (this.commands.has(command.id)) {
      const existing = this.commands.get(command.id)
      throw new CommandRegistryError(
        `Command "${command.id}" is already registered by ${existing?.pluginId ?? "the core editor"}.`,
      )
    }

    this.commands.set(command.id, command)

    return {
      dispose: () => {
        this.commands.delete(command.id)
      },
    }
  }

  /** Adds several, and rolls back entirely if any of them is a duplicate. */
  registerAll(commands: readonly Command[]): { dispose: () => void } {
    const added: string[] = []

    try {
      for (const command of commands) {
        this.register(command)
        added.push(command.id)
      }
    } catch (error) {
      // Half a plugin's commands is worse than none: the palette would list
      // some of its features and not others, with no way to tell which.
      for (const id of added) this.commands.delete(id)
      throw error
    }

    return {
      dispose: () => {
        for (const id of added) this.commands.delete(id)
      },
    }
  }

  unregister(id: string): boolean {
    return this.commands.delete(id)
  }

  get(id: string): Command | null {
    return this.commands.get(id) ?? null
  }

  has(id: string): boolean {
    return this.commands.has(id)
  }

  /** Every command, in registration order. */
  all(): readonly Command[] {
    return [...this.commands.values()]
  }

  /** Everything that could run right now. */
  available(context: EditorContext): readonly Command[] {
    return this.all().filter((command) => command.isAvailable(context))
  }

  /** Removes everything a plugin contributed, when it is unloaded. */
  removePlugin(pluginId: string): number {
    let removed = 0

    for (const [id, command] of this.commands) {
      if (command.pluginId === pluginId) {
        this.commands.delete(id)
        removed += 1
      }
    }

    return removed
  }
}

/** The registry the application uses. Tests build their own. */
export const commands = new CommandRegistry()
