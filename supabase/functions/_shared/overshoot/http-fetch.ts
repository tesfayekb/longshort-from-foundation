/**
 * HttpFetch — overshoot-owned minimal HTTP fetch shape.
 *
 * FP-069 W1b decoupling (ACT-456): the earlier W1a fetchers imported this
 * type from `_shared/longshort-universe-interfaces.ts`. That import was
 * benign at runtime (type-only) but forced the CI separation guard to keep
 * `longshort-universe-interfaces.ts` on the A3 allowlist. The overshoot
 * membrane is stricter when we own the type: this file redeclares the
 * shape verbatim from the longshort source of record (kept
 * signature-identical to preserve mocks + tests). Any drift in the
 * longshort side is fine — the overshoot tree is the leaf owner here.
 *
 * KEEP SIGNATURE-IDENTICAL to
 *   supabase/functions/_shared/longshort-universe-interfaces.ts :105 (HttpFetch)
 * so shared test mocks remain assignable without adapters.
 */
export type HttpFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;