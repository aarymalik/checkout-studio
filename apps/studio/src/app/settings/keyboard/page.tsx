import { preferenceRepository } from "@checkout-studio/database"
import { normalizeKeymap } from "@checkout-studio/editor"

import { KeyboardSettings } from "./KeyboardSettings"
import { requestPlatform } from "@/lib/platform"
import { requireSession } from "@/lib/session"

export const metadata = { title: "Keyboard" }

/**
 * Where shortcuts are changed, switched off and looked up.
 *
 * It doubles as the searchable reference: the list is the registry, so there is
 * one place that knows what every key does rather than a screen that can drift
 * from the keymap it describes.
 */
export default async function KeyboardSettingsPage() {
  const session = await requireSession("/settings/keyboard")
  const [stored, platform] = await Promise.all([
    preferenceRepository.get({ userId: session.userId }, "keyboard.keymap"),
    requestPlatform(),
  ])

  return <KeyboardSettings initialKeymap={normalizeKeymap(stored)} platform={platform} />
}
