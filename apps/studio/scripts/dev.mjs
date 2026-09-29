import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

/**
 * Starts the studio on the port `APP_URL` names.
 *
 * `APP_URL` is where this application believes it is: it is what every
 * verification and password-reset link is built from. When the development
 * server binds a different port, those links point somewhere nothing is
 * listening — and because a message with no mail provider configured is written
 * to the log rather than sent, the only symptom is somebody saying they never
 * got the email.
 *
 * Deriving the port from that one value rather than repeating it here means the
 * two cannot drift. A fresh clone gets 3000 from `.env.example`, and a machine
 * where 3000 is taken changes `APP_URL` alone.
 */

export const DEFAULT_PORT = "3000"

/** The port a URL names, or null when it names none. */
function portOf(url) {
  if (typeof url !== "string" || url === "") return null

  try {
    const { port } = new URL(url)

    return port === "" ? null : port
  } catch {
    // A malformed APP_URL is the environment's problem to report, and the
    // application's own validation reports it. Falling back keeps `pnpm dev`
    // running while somebody fixes it.
    return null
  }
}

/**
 * Which port to bind.
 *
 * `PORT` wins where it is set, because a platform that assigns one is not
 * asking. `APP_URL` is the machine's own answer. 3000 is Next's default, and
 * stays the default here.
 *
 * Exported so the precedence can be tested without starting a server.
 */
export function resolvePort(env) {
  const assigned = env["PORT"]

  if (typeof assigned === "string" && assigned !== "") return assigned

  return portOf(env["APP_URL"]) ?? DEFAULT_PORT
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  // Anything else the caller passed goes after ours, so `pnpm dev --port 3005`
  // still wins: Next takes the last `--port` it is given.
  const child = spawn(
    "next",
    ["dev", "--port", resolvePort(process.env), ...process.argv.slice(2)],
    { stdio: "inherit", env: process.env },
  )

  child.on("exit", (code, signal) => {
    // Relay how it died, so Ctrl-C reads as Ctrl-C rather than as a crash.
    if (signal !== null) process.kill(process.pid, signal)
    else process.exit(code ?? 0)
  })
}
