import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// *.integration.test.ts is deliberately excluded: those need a live
// Supabase instance and run only via `pnpm test:integration`
// (vitest.integration.config.ts). `pnpm test` (this config) must pass with
// no Supabase project and no environment variables.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Every test file that exercises the real repository layer imports
      // something that starts with `import "server-only"`
      // (supabase-repository.ts, infrastructure/supabase/*-client.ts), which
      // throws unconditionally outside Next.js's bundler (verified
      // directly: the package's main export is `throw new Error(...)`,
      // gated only by a "react-server" package.json export condition that
      // plain Vitest does not apply). A second consumer of the same
      // per-file `vi.mock("server-only", ...)` workaround showed up
      // (route.mock-mode.test.ts, alongside supabase-repository.test.ts),
      // so this is now aliased once here instead of repeated per file --
      // same approach as vitest.integration.config.ts.
      "server-only": fileURLToPath(new URL("./scripts/shared/server-only-stub.ts", import.meta.url)),
    },
  },
});
