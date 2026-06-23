#!/usr/bin/env -S deno run --allow-read

/**
 * check-lockfile-versions — DW-128 Stage-2 gate (Catalog #58 widened both-locks-v3 invariant).
 *
 * Asserts that BOTH Deno lockfiles in the repo are at lockfile format `version: "3"`:
 *   - root `deno.lock`                       (covers scripts/ + longshort-verifiers entrypoint set)
 *   - `supabase/functions/deno.lock`         (covers the edge-function tree)
 *
 * Why this gate exists: CI runs pinned Deno `v1.46.3` which reads v3 only. The Lovable
 * sandbox runs Deno 2.x which silently regenerates EITHER lock to `version: "5"` on any
 * `deno cache` / `deno test` invocation. That divergence has caused CI red THREE times
 * this session (Catalog #58 first firing on the functions lock, then on the root lock).
 * This script is the executable form of the Catalog #58 widened invariant.
 *
 * CRITICAL SAFETY INVARIANT — PURE JSON READ ONLY:
 * This script MUST NEVER invoke `deno cache`, `deno test`, or anything else that could
 * itself rewrite a lockfile. It uses `Deno.readTextFile` + `JSON.parse` exclusively.
 * Under the CI-pinned Deno 1.46.3 the script is a true reader; under the Lovable
 * sandbox's Deno 2.x it is ALSO a true reader (no `deno` subprocess is spawned, and
 * no module graph is resolved against a registry). This is the property that makes
 * the gate safe to run anywhere — it cannot itself trigger the v5 rewrite it guards.
 *
 * Exit code: 0 = both locks at v3; non-zero = at least one violation.
 */

/**
 * Expected lockfile format version. CI's pinned Deno binary (`v1.46.3`, declared at
 * `.github/workflows/strong-evidence.yml` `setup-deno@v1` step) reads lockfile
 * format v3 only; v5 (emitted by Deno 2.x) produces `error: Unsupported lockfile
 * version '5'`. Pinned per Catalog #58 (docs/ai-failure-modes.md).
 */
export const EXPECTED_LOCKFILE_VERSION = '3' as const;

/**
 * The two lockfiles the repo is contractually committed to keep at v3.
 * Both are required-present: a missing lock is itself a violation.
 */
export const REQUIRED_LOCKFILES = [
  'deno.lock',
  'supabase/functions/deno.lock',
] as const;

export type ViolationKind =
  | 'wrong-version'
  | 'missing-version-field'
  | 'missing-file'
  | 'unparseable-json';

export interface Violation {
  path: string;
  kind: ViolationKind;
  observed: string | null;
  message: string;
}

const REGEN_HINT =
  `expected version "${EXPECTED_LOCKFILE_VERSION}"; a v5 lock is the DW-128 ` +
  `Deno-2.x-sandbox-vs-CI-1.46.3 divergence — regenerate at v3 per Catalog #58`;

/**
 * Pure check over a parsed lockfile JSON value. Returns a Violation if the
 * top-level `version` field is missing or not exactly `EXPECTED_LOCKFILE_VERSION`;
 * returns null otherwise. No I/O, no side effects.
 */
export function checkLockfileVersion(
  lockJson: unknown,
  path: string,
): Violation | null {
  if (typeof lockJson !== 'object' || lockJson === null) {
    return {
      path,
      kind: 'missing-version-field',
      observed: null,
      message: `${path}: lockfile is not a JSON object`,
    };
  }
  const versionField = (lockJson as Record<string, unknown>).version;
  if (typeof versionField !== 'string') {
    return {
      path,
      kind: 'missing-version-field',
      observed: versionField === undefined ? null : String(versionField),
      message: `${path}: top-level "version" field is missing or non-string`,
    };
  }
  if (versionField !== EXPECTED_LOCKFILE_VERSION) {
    return {
      path,
      kind: 'wrong-version',
      observed: versionField,
      message: `${path}: observed version "${versionField}"; ${REGEN_HINT}`,
    };
  }
  return null;
}

/**
 * Read + JSON-parse a single lockfile from disk, returning a typed violation
 * for any read or parse failure rather than throwing. Pure I/O wrapper around
 * `checkLockfileVersion`. Never spawns a subprocess; never invokes `deno cache`.
 */
export async function checkLockfileAt(
  absoluteOrRelativePath: string,
  displayPath = absoluteOrRelativePath,
): Promise<Violation | null> {
  let text: string;
  try {
    text = await Deno.readTextFile(absoluteOrRelativePath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return {
        path: displayPath,
        kind: 'missing-file',
        observed: null,
        message: `${displayPath}: required lockfile not found on disk`,
      };
    }
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      path: displayPath,
      kind: 'unparseable-json',
      observed: null,
      message: `${displayPath}: lockfile is not valid JSON (${msg})`,
    };
  }
  return checkLockfileVersion(parsed, displayPath);
}

/**
 * Check every lockfile in `REQUIRED_LOCKFILES`, returning the collected
 * violations (empty array = clean). `rootDir` defaults to the current working
 * directory; tests may pass a tmp dir.
 */
export async function checkAllLockfiles(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const rel of REQUIRED_LOCKFILES) {
    const v = await checkLockfileAt(`${rootDir}/${rel}`, rel);
    if (v !== null) violations.push(v);
  }
  return violations;
}

if (import.meta.main) {
  const violations = await checkAllLockfiles();
  if (violations.length === 0) {
    console.log(
      `check-lockfile-versions: CLEAN — both lockfiles at version "${EXPECTED_LOCKFILE_VERSION}"`,
    );
    Deno.exit(0);
  }
  console.error(
    `check-lockfile-versions: FAIL — ${violations.length} violation(s):`,
  );
  for (const v of violations) {
    console.error(`  [${v.kind}] ${v.message}`);
  }
  Deno.exit(1);
}