/**
 * env.ts — Single-source, fail-fast loader for client-side environment variables.
 *
 * Owner: api / infrastructure
 * Classification: infrastructure-critical
 * Governance: docs/07-reference/env-var-index.md ("Startup gate" rule)
 * Regression: RW-021
 *
 * Contract:
 *   - Reads `import.meta.env.*` exactly once at module init.
 *   - Validates every `required` var is present, non-empty, and (for URLs) parseable
 *     via `new URL()`.
 *   - Throws `EnvConfigError` synchronously on first import if any required var is
 *     missing or malformed. ErrorBoundary catches the throw and renders a branded
 *     "App misconfigured" screen instead of letting `Failed to construct 'URL'` or
 *     `undefined/functions/v1/...` errors propagate from deep React Query stacks.
 *   - Optional vars return `undefined` (never throw).
 *
 * Rule: NEVER read `import.meta.env.VITE_SUPABASE_*` directly outside this file.
 * All consumers must import `env` from `@/lib/env`.
 */

export class EnvConfigError extends Error {
  constructor(public readonly missing: string[], public readonly invalid: string[]) {
    const parts: string[] = [];
    if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
    if (invalid.length) parts.push(`invalid: ${invalid.join(', ')}`);
    super(`App misconfigured — required environment variables (${parts.join('; ')}). See docs/07-reference/env-var-index.md.`);
    this.name = 'EnvConfigError';
  }
}

interface ClientEnv {
  /** Supabase project URL — base for all edge-function calls. */
  SUPABASE_URL: string;
  /** Supabase publishable (anon) key — sent as `apikey` header. */
  SUPABASE_PUBLISHABLE_KEY: string;
  /** Supabase project ref (id) — used by tooling and diagnostics. */
  SUPABASE_PROJECT_ID: string;
  /** Optional Sentry DSN — telemetry only. */
  SENTRY_DSN?: string;
  /** Optional Turnstile site key — auth captcha. */
  TURNSTILE_SITE_KEY?: string;
  /** Optional dev-mode toggle (string === 'true'). */
  DEV_MODE: boolean;
}

function readRaw(key: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (import.meta.env as any)?.[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

function loadEnv(): ClientEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const supabaseUrl = readRaw('VITE_SUPABASE_URL');
  const supabaseKey = readRaw('VITE_SUPABASE_PUBLISHABLE_KEY');
  const supabaseProjectId = readRaw('VITE_SUPABASE_PROJECT_ID');

  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  else {
    try {
      // Must be an absolute URL — `new URL(value)` is the canonical check.
      // Reject anything that does not parse or that lacks https:.
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        invalid.push('VITE_SUPABASE_URL (non-http(s) protocol)');
      }
    } catch {
      invalid.push('VITE_SUPABASE_URL (not a valid URL)');
    }
  }

  if (!supabaseKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseProjectId) missing.push('VITE_SUPABASE_PROJECT_ID');

  if (missing.length || invalid.length) {
    throw new EnvConfigError(missing, invalid);
  }

  return {
    SUPABASE_URL: supabaseUrl!,
    SUPABASE_PUBLISHABLE_KEY: supabaseKey!,
    SUPABASE_PROJECT_ID: supabaseProjectId!,
    SENTRY_DSN: readRaw('VITE_SENTRY_DSN'),
    TURNSTILE_SITE_KEY: readRaw('VITE_TURNSTILE_SITE_KEY'),
    DEV_MODE: readRaw('VITE_DEV_MODE') === 'true',
  };
}

/**
 * Frozen, validated client env. Importing this module throws synchronously
 * if any required var is missing — that's the fail-fast contract.
 */
export const env: ClientEnv = Object.freeze(loadEnv());

/** Convenience: canonical base URL for edge-function calls. No trailing slash. */
export function getFunctionsBaseUrl(): string {
  return `${env.SUPABASE_URL}/functions/v1`;
}

/**
 * Test-only re-validator. Exported for unit tests that mutate
 * `import.meta.env` via `vi.stubEnv` — call to re-run validation
 * against the current env snapshot.
 */
export function __validateEnvForTest(): ClientEnv {
  return loadEnv();
}