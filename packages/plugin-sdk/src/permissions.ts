import { z } from "zod"

/**
 * What a plugin is allowed to do.
 *
 * A plugin declares its permissions in its manifest and receives a grant it can
 * query. Restricted permissions require the user's approval before the plugin
 * activates at all, so a plugin that asks for payment access and is refused
 * never runs — rather than running and failing somewhere unhelpful.
 *
 * See docs/plugin-api.md § Permissions.
 */

export const PERMISSIONS = {
  "schema:read": {
    label: "Read the page",
    description: "See the nodes, styles, and settings of the page being edited.",
    restricted: false,
  },
  "schema:write": {
    label: "Change the page",
    description: "Insert, move, delete, and restyle nodes.",
    restricted: true,
  },
  publish: {
    label: "Publish",
    description: "Make a page live.",
    restricted: true,
  },
  "assets:read": {
    label: "Read assets",
    description: "List and reference uploaded images, fonts, and files.",
    restricted: false,
  },
  "assets:write": {
    label: "Upload assets",
    description: "Add files to the project's asset library.",
    restricted: true,
  },
  payments: {
    label: "Access payments",
    description: "Read order totals, currencies, and payment state.",
    restricted: true,
  },
  clipboard: {
    label: "Use the clipboard",
    description: "Read and write the system clipboard.",
    restricted: true,
  },
  network: {
    label: "Reach the network",
    description: "Call an external service from the editor.",
    restricted: true,
  },
} as const satisfies Record<string, { label: string; description: string; restricted: boolean }>

export type Permission = keyof typeof PERMISSIONS

export const PERMISSION_IDS = Object.keys(PERMISSIONS) as readonly Permission[]

export const permission = z.enum(PERMISSION_IDS as [Permission, ...Permission[]])

export function isRestricted(value: Permission): boolean {
  return PERMISSIONS[value].restricted
}

/** Every restricted permission in the list, in declaration order. */
export function restrictedAmong(requested: Iterable<Permission>): readonly Permission[] {
  return [...requested].filter(isRestricted)
}

/**
 * A plugin's permissions, as it sees them.
 *
 * Deliberately not an array. A plugin asking "may I?" should not be able to
 * change the answer, and a frozen set with one method is the smallest thing
 * that cannot be tampered with.
 */
export interface PermissionGrant {
  has(value: Permission): boolean
  /** Everything granted, for a settings screen to display. */
  list(): readonly Permission[]
}

export function createGrant(granted: Iterable<Permission>): PermissionGrant {
  const held = new Set(granted)

  return Object.freeze({
    has: (value: Permission) => held.has(value),
    list: () => [...held],
  })
}

/**
 * The restricted permissions a plugin asked for and was not given.
 *
 * Unrestricted permissions need no approval, so they never appear here. An
 * empty result means the plugin may activate.
 */
export function withheld(
  requested: Iterable<Permission>,
  granted: Iterable<Permission>,
): readonly Permission[] {
  const held = new Set(granted)

  return restrictedAmong(requested).filter((value) => !held.has(value))
}
