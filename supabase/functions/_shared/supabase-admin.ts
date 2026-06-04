/**
 * Shared Supabase admin client (service-role) — lazily constructed.
 *
 * Used by all edge functions for privileged operations.
 *
 * SECURITY: This client bypasses RLS. Use only in edge functions, never expose the
 * service role key to clients.
 *
 * Lazy construction (per FP-006 sub-step 6.3a.1 corrective): the underlying client is
 * built on first property access rather than at module load. This allows tests and other
 * module-load contexts (e.g., type-checking, import-graph analysis) to import this module
 * without setting SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. The Proxy preserves the
 * existing `supabaseAdmin.from('table').select(...)` call shape; consumers see no API
 * change, and method dispatch retains correct `this` binding via Reflect + .bind(client).
 *
 * The original eager module-load `createClient(...!)` pattern crashed any test runner that
 * imported this module without env vars (e.g., `deno test` of longshort-verifiers). That
 * was a 6.3a-surfaced defect (FOLLOWUP-003); this file IS the remediation.
 *
 * SPECIFIER (FP-008.4 Commit 7.5 / DW-082 A1.b): both `createClient` and the
 * `SupabaseClient` type are imported through the canonical npm specifier
 * (`@supabase/supabase-js`, mapped in `supabase/functions/deno.json` to
 * `npm:@supabase/supabase-js@^2.105.4`). Previously this file resolved the
 * symbols through `https://esm.sh/@supabase/supabase-js@2`, while every
 * consumer of `supabaseAdmin` imported `SupabaseClient` through the npm
 * specifier. Because `SupabaseClient` has a protected member, TypeScript
 * types it nominally — the same class loaded through two specifiers
 * produced two incompatible types and a latent TS2322 across the tree
 * (surfaced at the tick handler when Commit 7 brought that file into
 * Gate-11 typecheck coverage). Unifying the producer onto the canonical
 * specifier closes the class. Gate 14 (`check-supabase-client-specifier`)
 * pins this and prevents recurrence.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'supabase-admin: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set before first use',
    );
  }
  _client = createClient(url, key);
  return _client;
}

/**
 * Proxy preserves the existing `supabaseAdmin` named export. First property access
 * triggers client construction; subsequent accesses return cached methods/properties.
 *
 * `.bind(client)` is mandatory for method-valued properties — without it, method calls
 * lose `this` and supabase-js v2 methods (which use `this` internally) break.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});