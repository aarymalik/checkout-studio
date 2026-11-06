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

/**
 * What is happening while files are going up.
 *
 * Two fields, because an upload has two halves and they take unequal time. A
 * photograph's bytes go up in a second and the server then spends several
 * re-encoding it into four sizes and two formats — so `sent` reaching 1 is
 * not nearly done, and a bar that sat full for the longest part of the wait
 * would be the lie this was built to stop telling.
 */
export interface UploadProgress {
  /** What to say. "2 of 5 · hero.jpg", or what the server is doing with it. */
  label: string
  /** How much of the file has gone, 0 to 1 — or null while the server works. */
  sent: number | null
}

export interface UploadZoneProps {
  accept: string
  busy: UploadProgress | null
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
        {busy?.label ?? "Images, SVG, video, fonts and PDF"}
      </span>

      {busy !== null && <Bar sent={busy.sent} label={busy.label} />}

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

/**
 * How far along, when that is a thing anybody can know.
 *
 * Determinate while the bytes are going up, and striped-and-moving once they
 * are all there and the server is working — because at that point there is
 * genuinely no number. A bar that stopped at 100% and stayed there reads as
 * stuck, and one that crept forward on a timer would be inventing progress.
 */
function Bar({ sent, label }: { sent: number | null; label: string }) {
  const percent = sent === null ? null : Math.round(Math.min(1, Math.max(0, sent)) * 100)

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      /*
       * No `aria-valuenow` while the server is working, which is how ARIA
       * says "indeterminate". Any number here would be one nobody measured.
       */
      {...(percent === null ? {} : { "aria-valuenow": percent })}
      className={cn(
        "mt-1 block h-1 w-full overflow-hidden rounded-pill bg-surface-sunken",
        // The skeleton's shimmer, which is this system's way of saying
        // "something is happening and there is no number for it".
        percent === null && "animate-skeleton",
      )}
    >
      {percent === null ? null : (
        <span
          style={{ width: `${String(percent)}%` }}
          className="block h-full rounded-pill bg-primary transition-[width] duration-normal ease-standard"
        />
      )}
    </span>
  )
}
