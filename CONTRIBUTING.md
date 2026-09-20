# Contributing

1. Read `AGENTS.md`, `docs/team-ownership.md`, and `docs/api-contracts.md`.
2. Open a small issue or discuss a contract change with the relevant owners before editing shared types, fixtures, dependencies, or migrations.
3. Search for existing code with the same responsibility. Extend it instead of adding duplicate types or utilities.
4. Keep mock mode functional without keys and preserve the public read-only data boundary.
5. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before a PR.
6. Describe the feature, tests, any environment variables, and data/image provenance in the PR.

Do not contribute scraped or copied location records, images, contact information, or model weights without confirmed rights and attribution. Keep secrets out of commits.
