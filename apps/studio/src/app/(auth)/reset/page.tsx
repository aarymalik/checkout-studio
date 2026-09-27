import { Suspense } from "react"
import { AuthCard } from "../AuthCard"
import { ResetForm } from "./ResetForm"

export const metadata = { title: "Choose a new password · Checkout Studio" }

export default function ResetPage() {
  return (
    <AuthCard title="Choose a new password" description="Signing in everywhere else will be ended.">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthCard>
  )
}
