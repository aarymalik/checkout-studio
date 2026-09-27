import Link from "next/link"
import { AuthCard } from "../AuthCard"
import { SignUpForm } from "./SignUpForm"

export const metadata = { title: "Create an account · Checkout Studio" }

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create an account"
      description="Build checkout experiences that convert."
      footer={
        <>
          Already have one?{" "}
          <Link href="/sign-in" className="text-primary">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  )
}
