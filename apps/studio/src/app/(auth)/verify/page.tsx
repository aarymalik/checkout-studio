import { Suspense } from "react"
import { AuthCard } from "../AuthCard"
import { VerifyPanel } from "./VerifyPanel"

export const metadata = { title: "Confirm your email · Checkout Studio" }

export default function VerifyPage() {
  return (
    <AuthCard title="Confirm your email">
      <Suspense>
        <VerifyPanel />
      </Suspense>
    </AuthCard>
  )
}
