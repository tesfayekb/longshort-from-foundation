// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CATALYST_KEYWORDS,
  CATALYST_VERB_GATE,
  CATALYST_KEYWORD_FAMILIES,
  GUIDANCE_NUMERIC_PATTERN,
  assertKeywordMapsConsistent,
} from './catalyst-keywords.ts';

Deno.test('(1) noun + verb maps have identical family keys (anti-desync)', () => {
  assertEquals(
    Object.keys(CATALYST_KEYWORDS).sort(),
    Object.keys(CATALYST_VERB_GATE).sort(),
  );
});

Deno.test('(2) every family carries non-empty noun + verb lists', () => {
  for (const f of CATALYST_KEYWORD_FAMILIES) {
    if (CATALYST_KEYWORDS[f].length === 0) throw new Error(`empty nouns: ${f}`);
    if (CATALYST_VERB_GATE[f].length === 0) throw new Error(`empty verbs: ${f}`);
  }
});

Deno.test('(3) all terms are lower-case (matcher relies on single-pass toLowerCase)', () => {
  for (const f of CATALYST_KEYWORD_FAMILIES) {
    for (const n of CATALYST_KEYWORDS[f]) {
      assertEquals(n, n.toLowerCase(), `noun term not lowercased: '${n}' in '${f}'`);
    }
    for (const v of CATALYST_VERB_GATE[f]) {
      assertEquals(v, v.toLowerCase(), `verb term not lowercased: '${v}' in '${f}'`);
    }
  }
});

Deno.test('(4) frozen maps reject mutation (Object.freeze enforced at both levels)', () => {
  // Top-level freeze.
  assertThrows(
    () => {
      // @ts-ignore
      CATALYST_KEYWORDS.partnership = [];
    },
    TypeError,
  );
  // Inner-list freeze.
  assertThrows(
    () => {
      // @ts-ignore
      CATALYST_KEYWORDS.guidance.push('zzz');
    },
    TypeError,
  );
});

Deno.test('(5) GUIDANCE_NUMERIC_PATTERN matches digits and rejects letter-only', () => {
  assertEquals(GUIDANCE_NUMERIC_PATTERN.test('raises 2026 guidance'), true);
  assertEquals(GUIDANCE_NUMERIC_PATTERN.test('raises guidance midpoint'), false);
  assertEquals(GUIDANCE_NUMERIC_PATTERN.test('$1.2B'), true);
});

Deno.test('(6) assertKeywordMapsConsistent passes on the published baseline', () => {
  // Should not throw on the as-shipped maps.
  assertKeywordMapsConsistent();
});

Deno.test('(7) every IN-set keyword family is present in both maps (the four §(g) keyword families)', () => {
  const expected = ['executive_change', 'guidance', 'regulatory_action', 'partnership'].sort();
  assertEquals(Object.keys(CATALYST_KEYWORDS).sort(), expected);
});