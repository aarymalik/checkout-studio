import * as RadixToast from "@radix-ui/react-toast"
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react"
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * Transient messages.
 *
 * A toast is the wrong place for anything a reader must act on: it disappears,
 * it can be missed, and on a phone it may be covered. Confirmations and
 * progress live here; errors that need a decision belong in the interface.
 *
 * Radix owns the part that is hard: the live region that announces a toast
 * without stealing focus, F8 to move focus into the toasts, and a timer that
 * pauses while the pointer is over them or the window is in the background.
 */

export type ToastVariant = "info" | "success" | "warning" | "danger"

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  /** One action, at most. A toast with two decisions in it is a dialog. */
  action?: { label: string; onAction: () => void }
}

export type ToastInput = Omit<Toast, "id" | "variant"> & { variant?: ToastVariant }

interface ToastContextValue {
  toasts: readonly Toast[]
  show: (toast: ToastInput) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Wraps the surface that raises toasts.
 *
 * `duration` is deliberately generous. Four seconds is the usual default and is
 * not enough time to read two lines, notice an action and reach it.
 */
export function ToastProvider({
  children,
  duration = 6000,
}: {
  children: ReactNode
  duration?: number
}) {
  const [toasts, setToasts] = useState<readonly Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((toast: ToastInput) => {
    const id = `toast-${Math.random().toString(36).slice(2, 10)}`
    setToasts((current) => [...current, { ...toast, variant: toast.variant ?? "info", id }])
    return id
  }, [])

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider duration={duration} swipeDirection="right">
        {children}

        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}

        <RadixToast.Viewport
          className={cn("fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2 outline-none")}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

/** Raises a toast. Throws outside a provider, rather than silently doing nothing. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)

  if (context === null) {
    throw new Error("useToast must be used inside a ToastProvider.")
  }

  return context
}

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const

const ICON_COLORS = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.variant]

  return (
    <RadixToast.Root
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
      // Assertive for a failure, polite otherwise: a success message that
      // interrupts what a screen reader was already saying is worse than a
      // success message that waits.
      type={toast.variant === "danger" ? "foreground" : "background"}
      className={cn(
        "flex gap-3 rounded-card border border-border bg-surface-raised p-4 shadow-toast",
        "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)",
        "transition-transform duration-fast ease-standard",
      )}
    >
      <Icon aria-hidden="true" className={cn("mt-1 size-4 shrink-0", ICON_COLORS[toast.variant])} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <RadixToast.Title className="text-body font-medium text-foreground">
          {toast.title}
        </RadixToast.Title>

        {toast.description === undefined ? null : (
          <RadixToast.Description className="text-small text-foreground-muted">
            {toast.description}
          </RadixToast.Description>
        )}

        {toast.action === undefined ? null : (
          <RadixToast.Action
            altText={toast.action.label}
            onClick={toast.action.onAction}
            className={cn(
              "mt-1 self-start rounded-tight text-small font-medium text-primary",
              "transition-colors duration-fast ease-standard outline-none",
              "hover:text-primary-hover",
            )}
          >
            {toast.action.label}
          </RadixToast.Action>
        )}
      </div>

      <RadixToast.Close
        aria-label="Dismiss"
        className={cn(
          "-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center",
          "rounded-tight text-foreground-muted",
          "transition-colors duration-fast ease-standard outline-none",
          "hover:bg-surface-hover hover:text-foreground",
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </RadixToast.Close>
    </RadixToast.Root>
  )
}
