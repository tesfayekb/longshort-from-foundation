import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

/**
 * Test-environment scaffolding.
 *
 * (1) matchMedia shim for jsdom — components using @media queries need this
 *     to mount without throwing in jsdom.
 *
 * (2) VITE_SUPABASE_* env shim per CI-FIX-02 / Stage 1.5 (ACT-123) and
 *     operator caveat 2 (CI-INVESTIGATION-01 Path C-Hybrid, 2026-05-27).
 *     src/lib/env.ts (RW-021) throws EnvConfigError synchronously at module
 *     init when any required VITE_SUPABASE_* var is missing. Any test that
 *     transitively imports env.ts (api-client → env, hooks, etc.) triggers
 *     the throw at import time unless we provide valid values.
 *
 *     The shim MUST live in beforeEach (not at module top-level) so it
 *     coexists with RW-021's own afterEach `vi.unstubAllEnvs()` — that
 *     teardown would otherwise clear module-level stubs and leave later
 *     test files unable to import env.ts. beforeEach re-stubs before every
 *     test in the run; RW-021's own beforeEach overrides our values with
 *     its targeted stubs, which is the intended layering.
 *
 *     Values are canonical test fixtures, NOT real Supabase credentials.
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

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "test-project-id");
});
