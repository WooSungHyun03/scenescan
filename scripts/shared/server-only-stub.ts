// Alias target for the "server-only" package in vitest.integration.config.ts
// (integration tests run under plain Node/Vitest, never inside Next.js's
// bundler, so the real "server-only" package would throw unconditionally on
// import -- see scripts/shared/supabase-admin-client.ts's comment for how
// that was confirmed). Intentionally empty: the real package has no
// exports either, it only has an import-time side effect.
export {};
