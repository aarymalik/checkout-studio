/**
 * Stands in for `server-only` under the test environment.
 *
 * The real package exports a module that throws when a client bundle reaches
 * it, which is exactly what it is for. Vitest runs the Studio's tests in jsdom
 * and so looks like a client to it, and a route handler's test would fail on
 * the import rather than on anything it meant to check.
 *
 * Mirrors the stub in `packages/api/tests/stubs`. What the real package
 * protects — that server code never reaches the browser — is enforced by the
 * bundler at build time, which the test environment is not.
 */
export {}
