import Link from "next/link"
import { Suspense } from "react"
import { AuthCard } from "../AuthCard"
import { SignInForm } from "./SignInForm"

export const metadata = { title: "Sign in" }

export default function SignInPage() {
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          <Link href="/forgot" className="text-primary">
            Forgot your password?
          </Link>
          {" · "}
          <Link href="/sign-up" className="text-primary">
            Create an account
          </Link>
        </>
      }
    >
      {/* useSearchParams reads the request, so the form is rendered on the
          client and the page keeps its static shell. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthCard>
  )
}
