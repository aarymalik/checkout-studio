/**
 * The services an Embed may frame, and the address each one is framed at.
 *
 * ## A closed list, and no custom iframe
 *
 * The catalog lists YouTube, Vimeo, Calendly, Typeform and a custom iframe.
 * The custom one is not built.
 *
 * docs/security.md § Scripts on Checkout Pages ends "every script origin on a
 * published checkout is enumerated in its Content Security Policy", and
 * `frame-src` works the same way: a frame can only load from an origin the
 * policy names. An origin a merchant typed is an origin nobody reviewed, on a
 * page taking card details — which is the same argument that made Video
 * self-hosted only, and the reason that component's comment says an embed
 * would render a blank rectangle to a paying customer.
 *
 * With a closed list the policy is derivable: a page's `frame-src` is the
 * origins of the providers that page actually uses, and nothing else. Phase 16
 * builds that header; `PROVIDERS` is where it reads the origins from, so the
 * list cannot drift from what the components render.
 *
 * ## The component builds the address, it is never given one
 *
 * An author gives a provider and an id — a video id, a Calendly handle. The
 * address comes from the pattern here. A component that accepted a URL would
 * be a component where the origin is whatever the document says, which is the
 * thing the closed list exists to prevent, and it would be one bad import away
 * from framing anything.
 *
 * YouTube is framed at `youtube-nocookie.com`, which is their own address for
 * a player that sets nothing until somebody presses play. A checkout is not a
 * place to drop third-party cookies on someone.
 */

export interface Provider {
  /** Shown in the inspector. */
  label: string
  /** The origin the CSP has to name for this provider. */
  origin: string
  /** What the author is asked for. */
  idLabel: string
  /** Help text under the field, naming where the value is found. */
  idHelp: string
  /** The characters an id may contain. */
  idPattern: RegExp
  /** The address, built from an id this provider accepts. */
  src: (id: string) => string
  /** A frame's shape, where the provider has one. */
  aspectRatio?: string
}

export const PROVIDERS: Readonly<Record<string, Provider>> = {
  youtube: {
    label: "YouTube",
    origin: "https://www.youtube-nocookie.com",
    idLabel: "Video ID",
    idHelp: "The part after v= in the address, such as dQw4w9WgXcQ.",
    idPattern: /^[\w-]{6,20}$/,
    src: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
    aspectRatio: "16 / 9",
  },
  vimeo: {
    label: "Vimeo",
    origin: "https://player.vimeo.com",
    idLabel: "Video ID",
    idHelp: "The number in the address, such as 76979871.",
    idPattern: /^\d{6,12}$/,
    src: (id) => `https://player.vimeo.com/video/${id}`,
    aspectRatio: "16 / 9",
  },
  calendly: {
    label: "Calendly",
    origin: "https://calendly.com",
    idLabel: "Booking link",
    idHelp: "The part after calendly.com, such as acme/intro-call.",
    idPattern: /^[\w-]+(\/[\w-]+)*$/,
    src: (id) => `https://calendly.com/${id}`,
  },
  typeform: {
    label: "Typeform",
    origin: "https://form.typeform.com",
    idLabel: "Form ID",
    idHelp: "The part after /to/ in the address, such as u6nXL7.",
    idPattern: /^[\w-]{4,24}$/,
    src: (id) => `https://form.typeform.com/to/${id}`,
  },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS)

/** The provider this node names, if it names one we frame. */
export function providerOf(value: unknown): Provider | null {
  return typeof value === "string" ? (PROVIDERS[value] ?? null) : null
}

/**
 * The address to frame, or null.
 *
 * Null for an id this provider would not recognise, rather than a frame that
 * loads somebody else's page. The patterns are deliberately tight: an id is
 * going into a URL, and `../` in one is a different address entirely.
 */
export function srcFor(provider: Provider, id: unknown): string | null {
  if (typeof id !== "string") return null

  const trimmed = id.trim()

  return provider.idPattern.test(trimmed) ? provider.src(trimmed) : null
}
