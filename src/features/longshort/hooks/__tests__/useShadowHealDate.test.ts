import { describe, it, expect } from 'vitest';
import { useShadowHealDate } from '@/features/longshort/hooks/useShadowHealDate';

describe('useShadowHealDate — FP-054 54.1 export surface', () => {
  it('exports the hook function', () => {
    expect(typeof useShadowHealDate).toBe('function');
  });
});