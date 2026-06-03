/**
 * Gate 11 type-check coverage anchor — FP-008.4 Commit 2.5 / INC-30.
 *
 * Purpose: force `deno test --no-run` to walk index.ts's dependency graph so
 * its types are checked on every gate run. Without this sibling file, the
 * entry point is invisible to Gate 11 (see INC-30 + DW-082).
 *
 * The type-check IS the test. No runtime behavioral assertion is required
 * here; behavioral coverage lives in replay fixtures + integration paths.
 */
import { assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import "./index.ts";

Deno.test("enrich-and-filter/index.ts type-checks (Gate 11 coverage — FP-008.4 Commit 2.5)", () => {
  assertExists(import.meta.url);
});
