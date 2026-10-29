import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

/**
 * A valid test environment.
 *
 * The application's env module validates at import time, so these must be set
 * before any module under test is imported. Vitest runs setup files first.
 */
// Assigned together rather than one at a time: NODE_ENV is typed readonly,
// and a cast per line would be five casts saying the same thing.
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://localhost:5432/checkout_studio_test",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SESSION_SECRET: "test-session-secret-at-least-32-bytes-long",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "noreply@example.test",
  STRIPE_SECRET_KEY: "sk_test_stripe",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_stripe",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_WEBHOOK_SECRET_BILLING: "whsec_test_billing",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "checkout-assets",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  ASSET_BASE_URL: "http://localhost:9000/checkout-assets",
})

/**
 * jsdom has no ResizeObserver.
 *
 * A stub rather than a polyfill: the components that observe their own size
 * need the constructor to exist, and a test asserting on a measured layout
 * would be asserting on jsdom's zero-height boxes rather than on the design.
 */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * jsdom implements no pointer capture.
 *
 * A Radix select grabs the pointer when its trigger goes down, and calls these
 * on the element to do it. Missing, the component throws before it can open,
 * which looks like a broken control rather than a missing browser API. The ui
 * and editor packages stub the same three for the same reason.
 *
 * Stubs, not a polyfill: nothing about pointer capture is what a test here is
 * asking about, and a test that depended on it would be testing jsdom.
 */
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {}
Element.prototype.hasPointerCapture ??= function hasPointerCapture(): boolean {
  return false
}
Element.prototype.setPointerCapture ??= function setPointerCapture(): void {}
Element.prototype.releasePointerCapture ??= function releasePointerCapture(): void {}

/**
 * Every test gets a clean document. Without this, a component left mounted by
 * one test is found by the next one's queries.
 */
afterEach(() => {
  cleanup()
})
