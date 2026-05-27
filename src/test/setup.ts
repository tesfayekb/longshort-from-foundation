import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

/**
 * Test-environment scaffolding.
 *
 * (1) matchMedia shim for jsdom — components using @media queries need this
 *     to mount without throwing in jsdom.
 *
 * (2) VITE_SUPABASE_* env shim per CI-FIX-03 / Stage 1.6 (ACT-124) and
 *     operator caveat 2 + 2.1 (CI-INVESTIGATION-01 Path C-Hybrid, 2026-05-27).
 *
 *     The shim is applied at TWO LOCATIONS to handle Vitest's hoist semantics:
 *
 *     (a) MODULE-INIT (top-level execution below) — fires when setupFiles
 *         loads, BEFORE any test file's vi.mock factory executes. Required
 *         because vi.mock factories that call vi.importActual('@/lib/api-client')
 *         (rw018, rw019) trigger env.ts module evaluation at vi.mock factory
 *         hoist time, BEFORE per-test beforeEach hooks fire. Per Vitest 3.x
 *         docs (https://vitest.dev/guide/mocking + GitHub issue #3228 verbatim):
 *         "vi.mock is hoisted even before the imports". Without the module-init
 *         stubs, vi.importActual('@/lib/api-client') triggers env.ts throw
 *         before any beforeEach fires.
 *
 *     (b) beforeEach (per-test re-stub below) — fires before each test to
 *         handle RW-021's afterEach vi.unstubAllEnvs() within-file teardown.
 *         RW-021's contract is preserved: its beforeEach overrides with its
 *         own targeted stubs; its afterEach unstubs; the next test in any
 *         file gets re-stubbed either by setupFiles re-execution (next file)
 *         or by this beforeEach (same file).
 *
 *     Both locations are required — neither alone is sufficient. Module-init
 *     alone fails when RW-021's afterEach clears the stubs mid-file run.
 *     beforeEach-only alone fails when test-file vi.mock factories execute
 *     before beforeEach has fired (the CI-FIX-02 external CI failure mode at
 *     SHA a00ce8eb). Operator caveat 2.1: this is ADD-not-MOVE — both
 *     locations coexist.
 *
 *     Lineage: CI-FIX-02 (ACT-123) original beforeEach-only form failed
 *     external CI at SHA a00ce8eb for vi.mock-factory-timing reasons (rw018
 *     + rw019 still showed env.ts throws as vi.mock factory hoist errors).
 *     CI-FIX-03 (this fix) adds module-init stubs as the primary protection
 *     and keeps beforeEach as belt-and-suspenders for RW-021 afterEach coverage.
 *     See DW-077 pattern-establishing instance #9 (defect-#36 family).
 *
 *     Values are canonical test fixtures, NOT real Supabase credentials.
 *     src/lib/env.ts RW-021 fail-fast contract preserved verbatim.
 */

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// (2a) MODULE-INIT stubs — fire BEFORE test-file vi.mock factories hoist
// (ADDED at CI-FIX-03; operator caveat 2.1 = ADD-not-MOVE; beforeEach block below retained verbatim)
vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "test-project-id");

// (2b) beforeEach re-stubs — RETAINED FROM CI-FIX-02 unchanged
// (handle RW-021 afterEach vi.unstubAllEnvs() within-file teardown)
beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "test-project-id");
});
