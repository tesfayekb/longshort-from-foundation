/**
 * CORS headers — dynamic origin validation using ALLOWED_ORIGINS env var.
 *
 * Restricts Access-Control-Allow-Origin to known app domains.
 * Lovable preview origins (`*.lovable.app`, `*.lovableproject.com`) are
 * always allowed in addition to the explicit ALLOWED_ORIGINS list, so
 * preview environments never hit CORS rejection regardless of secret config.
 * Falls back to first allowed origin if request origin doesn't match.
 * If ALLOWED_ORIGINS is not set, falls back to wildcard (development only).
 */

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

/**
 * Lovable platform preview hosts — always permitted.
 * These are first-party Lovable preview environments and are inherently
 * trusted for the duration of the build/preview session.
 */
const LOVABLE_PREVIEW_HOST_SUFFIXES = [
  '.lovable.app',
  '.lovableproject.com',
  '.lovable.dev',
] as const;

function isLovablePreviewOrigin(origin: string): boolean {
  if (!origin.startsWith('https://')) return false;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return LOVABLE_PREVIEW_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));
}

/**
 * Returns CORS headers with validated origin.
 * If the request origin is in the allow-list, it is echoed back.
 * Otherwise, the first allowed origin is returned (browsers will block).
 */
export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  let origin: string;

  if (ALLOWED_ORIGINS.length === 0) {
    // No allow-list configured — development fallback
    origin = '*';
  } else {
    const reqOrigin = requestOrigin ?? '';
    if (ALLOWED_ORIGINS.includes(reqOrigin) || isLovablePreviewOrigin(reqOrigin)) {
      origin = reqOrigin;
    } else {
      origin = ALLOWED_ORIGINS[0];
    }
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    ...(ALLOWED_ORIGINS.length > 0 ? { 'Vary': 'Origin' } : {}),
  };
}

/** Backward-compatible static export for imports that don't have request context */
export const corsHeaders = getCorsHeaders(null);
