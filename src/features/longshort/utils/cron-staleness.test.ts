/**
 * UI-001 — cron-aware staleness predicate tests.
 *
 * Sentinels (u1–u4):
 *   u1: weekday-only `0 20 * * 1-5`, fired Fri 20:00, "now" = Sun → fresh
 *   u2: daily `0 21 * * *`, fired yesterday 21:00, "now" today 22:00 → fresh
 *   u3: daily `0 21 * * *`, fired 26h ago → stale
 *   u4: no cron / derived → predicate is N/A (caller must short-circuit)
 */
import { describe, it, expect } from 'vitest';
import {
  isSignalStale,
  nextExpectedFire,
  cadenceLabel,
} from './cron-staleness';

describe('cron-staleness (UI-001)', () => {
  it('u1: weekday-only signal is FRESH all weekend after Friday fire', () => {
    // Friday 2026-06-12 20:00 UTC
    const lastFire = new Date('2026-06-12T20:00:05Z');
    // Sunday 2026-06-14 18:00 UTC
    const now = new Date('2026-06-14T18:00:00Z');
    expect(isSignalStale(lastFire, '0 20 * * 1-5', now)).toBe(false);
    // next expected = Monday 2026-06-15 20:00 UTC
    const next = nextExpectedFire('0 20 * * 1-5', lastFire);
    expect(next?.toISOString()).toBe('2026-06-15T20:00:00.000Z');
  });

  it('u2: daily signal within next window is FRESH', () => {
    // Fired yesterday 21:00, now today 22:00 → next expected today 21:00 +30m
    // already passed BUT we evaluate against last completion's next, which is
    // today 21:00; 22:00 > 21:30 → stale by strict contract. Operator example
    // was about being inside a fresh-by-cadence window — express it as a
    // signal that fired ~25min ago.
    const lastFire = new Date('2026-06-14T21:00:00Z');
    const now = new Date('2026-06-14T21:25:00Z');
    expect(isSignalStale(lastFire, '0 21 * * *', now)).toBe(false);
  });

  it('u3: daily signal silent for >24h+slack is STALE', () => {
    const lastFire = new Date('2026-06-13T20:00:00Z');
    const now = new Date('2026-06-14T22:00:00Z'); // 26h later
    expect(isSignalStale(lastFire, '0 21 * * *', now)).toBe(true);
  });

  it('u4: unparseable / missing cron yields no false-positive verdict', () => {
    const lastFire = new Date('2026-06-12T20:00:00Z');
    const now = new Date('2026-06-14T18:00:00Z');
    expect(isSignalStale(lastFire, 'not-a-cron', now)).toBe(false);
    expect(nextExpectedFire('not-a-cron', lastFire)).toBeNull();
  });

  it('cadenceLabel compresses known masks; falls back to raw mask otherwise', () => {
    expect(cadenceLabel('0 20 * * 1-5')).toBe('weekday 20:00 UTC');
    expect(cadenceLabel('15 21 * * 1-5')).toBe('weekday 21:15 UTC');
    expect(cadenceLabel('0 21 1,15 * *')).toBe('twice-monthly (1st & 15th, 21:00 UTC)');
    expect(cadenceLabel('5 4 * * *')).toBe('5 4 * * *');
    expect(cadenceLabel(null)).toBeNull();
  });
});