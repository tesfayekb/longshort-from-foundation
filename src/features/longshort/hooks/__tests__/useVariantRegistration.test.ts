import { describe, it, expect } from 'vitest';
import { useVariantRegistration } from '@/features/longshort/hooks/useVariantRegistration';

describe('useVariantRegistration — FP-054 54.1 Fork A (reader-only)', () => {
  it('exports the hook function (v1 returns { registration: null })', () => {
    expect(typeof useVariantRegistration).toBe('function');
  });
});