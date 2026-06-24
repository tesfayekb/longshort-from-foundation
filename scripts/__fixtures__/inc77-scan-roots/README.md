# INC-77 SCAN_ROOT-expansion lint fixtures

Read-only fixture tree consumed by `scripts/check-paper-only-url_test.ts` to
prove the multi-root walk of `scanRepository(rootDir)` without requiring
`--allow-write` (Gate-2/Gate-2b run with `--allow-read --allow-net --allow-env`
by deliberate hardening — see `.github/workflows/strong-evidence.yml` line
51-58 + Gate-2 step rationale).

The fixture `.ts` files intentionally contain the banned live-Alpaca URL
literal so the lint can detect them. They are SAFE in the real repo because
`check-paper-only-url`'s `SCAN_ROOTS` only walks `src/features/longshort/**`
and `supabase/functions/**` — this fixture tree lives under
`scripts/__fixtures__/` and is invisible to a default `scanRepository('.')`
run. The tests pass the fixture-tree path as `rootDir` to exercise the walk.

Pattern parallels the existing `scripts/__fixtures__/unparseable.lock`
committed fixture used by `check-lockfile-versions_test.ts`.