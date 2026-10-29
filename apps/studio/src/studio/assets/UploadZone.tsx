"use client"

import { Upload } from "lucide-react"
import { useId, useState } from "react"
import type { DragEvent } from "react"
import { cn } from "@checkout-studio/ui"

/**
 * Hands files over as soon as they are chosen.
 *
 * Deliberately not `FileUpload` from the component library. That one stages a
 * choice for a form to submit later, and keeps a list of what was chosen with
 * a Remove button beside each one. Here the upload has already happened by the
 * time that list would render, so the button would sit next to a stored asset
 * looking exactly like the one that deletes it.
 *
 * What it keeps from that component is the part worth copying: a real file
 * input with the drop zone as its label, so dropping works and so do Tab and
 * Enter. A zone that was only a drop target would be unusable by keyboard and
 * close to unusable with a screen reader.
 */

export interface UploadZoneProps {
  accept: string
  busy: string | null
  onFiles: (files: readonly File[]) => void
}

export function UploadZone({ accept, busy, onFiles }: UploadZoneProps) {
  const id = useId()
  const [dragging, setDragging] = useState(false)

  function take(files: readonly File[]): void {
    setDragging(false)

    if (files.length > 0) onFiles(files)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault()

    if (busy === null) take([...event.dataTransfer.files])
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault()
        if (busy === null) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1 p-4",
        "rounded-card border border-dashed border-border-strong bg-surface text-center",
        "transition-colors duration-fast ease-standard",
        "hover:bg-surface-hover",
        // On the zone, because the input is visually hidden and a keyboard user
        // has to see what they are about to operate.
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring",
        dragging && "border-primary bg-primary-subtle",
        busy !== null && "pointer-events-none opacity-50",
      )}
    >
      <Upload aria-hidden="true" className="size-4 text-foreground-muted" />
      <span className="text-small font-medium text-foreground">Upload files</span>
      <span className="text-caption text-foreground-muted">
        {busy ?? "Images, SVG, video, fonts and PDF"}
      </span>

      <input
        id={id}
        type="file"
        accept={accept}
        multiple
        disabled={busy !== null}
        onChange={(event) => take([...(event.target.files ?? [])])}
        className="sr-only"
      />
    </label>
  )
}
