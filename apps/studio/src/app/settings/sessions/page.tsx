import { SessionList } from "./SessionList"

export const metadata = { title: "Active sessions · Checkout Studio" }

/**
 * Where somebody checks whether their account is being used elsewhere.
 *
 * Reached only with a session, which the proxy checks for and the API route
 * resolves properly.
 */
export default function SessionsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 font-semibold text-foreground">Active sessions</h1>
        <p className="text-body text-foreground-muted">
          Every browser signed in to your account. If you see one you do not recognise, end it and
          change your password.
        </p>
      </div>

      <SessionList />
    </main>
  )
}
