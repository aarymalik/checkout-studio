/**
 * `server-only` throws unless it is loaded inside a React Server Component
 * graph. Its job is to make a client-side import a build error, which it does
 * in the applications. Under Vitest there is no such graph, so it is aliased
 * to this empty module.
 */
export {}
