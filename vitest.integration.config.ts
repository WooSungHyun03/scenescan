import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts (unit) on purpose: these tests need a live
// Supabase instance (see docs/integration-testing.md) and are never run as
// part of `pnpm test`. `pnpm test:integration` is the only thing that loads
// this file.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.integration.test.ts",
      "scripts/**/*.integration.test.ts",
      "supabase/tests/**/*.integration.test.ts",
    ],
    // DB round trips (including a fresh Postgres connection per test file)
    // are slower than the pure-function unit suite's default 5s timeout.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // All integration files share ONE live Postgres instance. Vitest runs
    // test files in parallel worker processes by default; some assertions
    // here (e.g. "the RPC with no filter matches nothing") are necessarily
    // table-wide, not scoped to one test's own rows, and can observe
    // another file's in-progress seed data if both run at the same time --
    // confirmed directly: without this setting,
    // match-location-images.integration.test.ts intermittently failed
    // because supabase-repository.integration.test.ts (a different file,
    // running concurrently) had rows alive in the same table at that
    // moment. Running files sequentially trades integration-suite runtime
    // for not having to make every assertion in every file defensively
    // scoped against unrelated concurrent data.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Every integration test that exercises the real repository layer
      // imports something that starts with `import "server-only"`
      // (src/domains/locations/server/supabase-repository.ts and
      // src/infrastructure/supabase/*-client.ts). The unit config
      // (vitest.config.ts) handles this with a per-file
      // vi.mock("server-only", ...) because only one file needed it there;
      // that file's own comment already flagged a global alias as the
      // right call once a second consumer showed up. Integration tests are
      // exactly that: essentially every file here touches the real
      // repository, so aliasing once at the config level avoids repeating
      // the same boilerplate mock in every file.
      "server-only": fileURLToPath(new URL("./scripts/shared/server-only-stub.ts", import.meta.url)),
    },
  },
});
