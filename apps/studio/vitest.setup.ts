/**
 * A valid test environment.
 *
 * The application's env module validates at import time, so these must be set
 * before any module under test is imported. Vitest runs setup files first.
 */
process.env["NODE_ENV"] = "test"
process.env["APP_URL"] = "http://localhost:3000"
process.env["DATABASE_URL"] = "postgres://localhost:5432/checkout_studio_test"
process.env["REDIS_URL"] = "redis://localhost:6379"
process.env["CLERK_SECRET_KEY"] = "sk_test_clerk"
process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = "pk_test_clerk"
process.env["STRIPE_SECRET_KEY"] = "sk_test_stripe"
process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] = "pk_test_stripe"
process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test"
process.env["STRIPE_WEBHOOK_SECRET_BILLING"] = "whsec_test_billing"
process.env["UPLOADTHING_SECRET"] = "ut_test"
process.env["UPLOADTHING_APP_ID"] = "ut_app"
