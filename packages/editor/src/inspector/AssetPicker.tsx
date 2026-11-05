"use client"

import { Select, SelectOption } from "@checkout-studio/ui"
import type { AssetReference } from "@checkout-studio/schema"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { useAssets } from "../assets/context"

/**
 * The asset a property points at, chosen from the project's library.
 *
 * ## A list and not a file field
 *
 * An asset is uploaded once and used in several places, so what this control
 * does is *point* at one. Offering a file field here would mean a second
 * upload path beside the Assets panel, a second set of quota and type
 * refusals, and a library full of the same image four times.
 *
 * ## Why a select and not a grid of thumbnails
 *
 * Radix's select brings typeahead, arrow keys, Home and End, Escape, and the
 * choice announced on change — the behaviour a grid in a popover would have to
 * reimplement, which the Assets panel already proved is the expensive part.
 * The thumbnail rides along inside each option, so it is still a picture being
 * picked rather than a file name, and the chosen one is shown underneath at a
 * size somebody can actually judge.
 *
 * A reference is the only thing this writes. Clearing one is its own slice:
 * "no image" and "the image this component ships" are different answers, and
 * the panel's reset already gives the second.
 */

/** The id in `{ "$asset": "ast_9f2a" }`, or null for anything else. */
function assetIdOf(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null

  const held = (value as { $asset?: unknown }).$asset

  return typeof held === "string" && held !== "" ? held : null
}

export function AssetPicker({
  definition,
  value,
  mixed,
  disabled,
  onChange,
}: {
  definition: PropertyDefinition
  value: unknown
  mixed: boolean
  disabled: boolean
  onChange: (reference: AssetReference) => void
}): ReactElement {
  const assets = useAssets()
  const held = assetIdOf(value)
  const chosen = assets.find((asset) => asset.id === held) ?? null

  if (assets.length === 0) {
    return (
      <div data-inspector-asset={definition.key}>
        <p className="text-small text-foreground">{definition.label}</p>
        <p className="text-caption text-foreground-muted">
          {held === null
            ? "No assets yet. Upload one in the Assets panel."
            : "This points at an asset that is gone, and there is nothing else to choose."}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-inspector-asset={definition.key}>
      <Select
        label={definition.label}
        {...(definition.help === undefined ? {} : { description: definition.help })}
        disabled={disabled}
        {...(mixed || chosen === null ? {} : { value: chosen.id })}
        /*
         * A reference pointing at nothing says so, rather than reading as
         * unset. An asset can be deleted while a page still names it — the
         * canvas draws that as a gap, and a control showing "Choose an asset"
         * over it would suggest nobody had ever chosen.
         */
        placeholder={
          mixed ? "Mixed" : held === null ? "Choose an asset…" : "No longer in the library"
        }
        onValueChange={(next) => {
          onChange({ $asset: next })
        }}
      >
        {assets.map((asset) => (
          <SelectOption key={asset.id} value={asset.id}>
            <span className="flex min-w-0 items-center gap-2">
              {asset.previewUrl === null ? null : (
                <img
                  src={asset.previewUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-5 shrink-0 rounded-tight object-cover"
                />
              )}
              <span className="truncate">{asset.name}</span>
            </span>
          </SelectOption>
        ))}
      </Select>

      {mixed || chosen === null || chosen.previewUrl === null ? null : (
        <Preview propertyKey={definition.key} src={chosen.previewUrl} />
      )}
    </div>
  )
}

/**
 * The chosen asset, big enough to recognise.
 *
 * Decorative: its name is in the control above it, so a screen reader reading
 * this picture out would read the same thing twice. Contained rather than
 * cropped — a control that showed the middle of somebody's logo would be a
 * control that lied about what they picked.
 */
function Preview({ propertyKey, src }: { propertyKey: string; src: string }): ReactElement {
  return (
    <span
      data-inspector-preview={propertyKey}
      className="flex h-24 items-center justify-center overflow-hidden rounded-control bg-surface-sunken"
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="max-h-full max-w-full object-contain"
      />
    </span>
  )
}
