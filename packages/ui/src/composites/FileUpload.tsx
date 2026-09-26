import { Upload, X } from "lucide-react"
import { useId, useRef, useState } from "react"
import type { DragEvent } from "react"
import { cn } from "../lib/cn"

/**
 * A file chooser that also accepts a drop.
 *
 * The drop zone is an addition, never the only route: dragging a file is
 * impossible with a keyboard and hard with a screen reader. Underneath is a real
 * file input, reachable by Tab and operable with Enter, and the zone is a label
 * for it rather than a div pretending to be one.
 *
 * Validation happens here so the reader hears about a file that is too large
 * before it is uploaded, not after. The upload itself belongs to the
 * application — see apps/studio/src/lib/uploads.ts.
 */
export interface FileUploadProps {
  label: string
  /** MIME types, as an `accept` attribute: "image/png,image/jpeg". */
  accept?: string
  /** Bytes. A file over this is rejected with a message naming the limit. */
  maxSize?: number
  multiple?: boolean
  description?: string
  disabled?: boolean
  onFilesChange: (files: readonly File[]) => void
}

/** Bytes as something a person reads. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}

export function FileUpload({
  label,
  accept,
  maxSize,
  multiple = false,
  description,
  disabled = false,
  onFilesChange,
}: FileUploadProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<readonly File[]>([])
  const [rejected, setRejected] = useState<readonly string[]>([])
  const [dragging, setDragging] = useState(false)

  function accepts(file: File): boolean {
    if (accept === undefined) return true

    return accept.split(",").some((pattern) => {
      const type = pattern.trim()
      return type.endsWith("/*") ? file.type.startsWith(type.slice(0, -1)) : file.type === type
    })
  }

  function take(incoming: readonly File[]): void {
    const problems: string[] = []
    const kept: File[] = []

    for (const file of incoming) {
      if (!accepts(file)) {
        problems.push(`${file.name} is not a permitted file type.`)
      } else if (maxSize !== undefined && file.size > maxSize) {
        problems.push(`${file.name} is larger than ${formatSize(maxSize)}.`)
      } else {
        kept.push(file)
      }
    }

    const next = multiple ? [...files, ...kept] : kept.slice(0, 1)
    setFiles(next)
    setRejected(problems)
    onFilesChange(next)
  }

  function remove(name: string): void {
    const next = files.filter((file) => file.name !== name)
    setFiles(next)
    onFilesChange(next)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    take([...event.dataTransfer.files])
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 p-8",
          "rounded-card border border-dashed border-border-strong bg-surface",
          "text-center",
          "transition-colors duration-fast ease-standard",
          "hover:bg-surface-hover",
          // The ring lands here because the input itself is visually hidden, so
          // a keyboard user sees the zone they are about to operate.
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring",
          dragging && "border-primary bg-primary-subtle",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload aria-hidden="true" className="size-5 text-foreground-muted" />
        <span className="text-body font-medium text-foreground">{label}</span>
        {description === undefined ? null : (
          <span className="text-caption text-foreground-muted">{description}</span>
        )}
        {maxSize === undefined ? null : (
          <span className="text-caption text-foreground-subtle">Up to {formatSize(maxSize)}</span>
        )}

        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => take([...(event.target.files ?? [])])}
          className="sr-only"
        />
      </label>

      {rejected.length === 0 ? null : (
        <ul role="alert" className="flex flex-col gap-1 text-caption text-danger">
          {rejected.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {files.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between gap-2 rounded-tight bg-surface-sunken p-2"
            >
              <span className="min-w-0 flex-1 truncate text-small text-foreground">
                {file.name}
              </span>
              <span className="text-caption text-foreground-muted">{formatSize(file.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => remove(file.name)}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-tight",
                  "text-foreground-muted",
                  "transition-colors duration-fast ease-standard outline-none",
                  "hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
