import { Search, X } from "lucide-react"
import { useId } from "react"
import type { ComponentPropsWithRef } from "react"
import { cn } from "../lib/cn"

/**
 * A search field.
 *
 * `type="search"` so it is announced as one, with a labelled clear button that
 * appears only when there is something to clear. Clearing returns focus to the
 * field: a reader who clears a search is about to type another one, and sending
 * focus to the body makes them find the field again.
 */
export interface SearchInputProps extends Omit<
  ComponentPropsWithRef<"input">,
  "type" | "value" | "onChange"
> {
  /** Announced, and shown unless hidden. Never a placeholder standing in for one. */
  label: string
  labelHidden?: boolean
  value: string
  onValueChange: (value: string) => void
}

export function SearchInput({
  className,
  label,
  labelHidden = true,
  value,
  onValueChange,
  id,
  ...props
}: SearchInputProps) {
  const generated = useId()
  const controlId = id ?? generated

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={controlId}
        className={cn("text-small font-medium text-foreground", labelHidden && "sr-only")}
      >
        {label}
      </label>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
        />

        <input
          id={controlId}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            "h-control-md w-full rounded-control border border-border-strong bg-surface",
            "pr-10 pl-8 text-body text-foreground",
            "placeholder:text-foreground-subtle",
            "transition-colors duration-fast ease-standard outline-none",
            // Safari draws its own clear button on a search input, beside ours.
            "[&::-webkit-search-cancel-button]:hidden",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />

        {value === "" ? null : (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onValueChange("")
              document.getElementById(controlId)?.focus()
            }}
            className={cn(
              "absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center",
              "rounded-tight text-foreground-muted",
              "transition-colors duration-fast ease-standard outline-none",
              "hover:bg-surface-hover hover:text-foreground",
            )}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
