import Link from "next/link"
import { AuthCard } from "../AuthCard"
import { ForgotForm } from "./ForgotForm"

export const metadata = { title: "Reset your password" }

export default function ForgotPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a link to choose a new one."
      footer={
        <Link href="/sign-in" className="text-primary">
          Back to sign in
        </Link>
      }
    >
      <ForgotForm />
    </AuthCard>
  )
}
