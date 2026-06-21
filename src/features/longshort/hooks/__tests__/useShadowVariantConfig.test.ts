import { describe, it, expect } from 'vitest';
import { useShadowVariantConfig } from '@/features/longshort/hooks/useShadowVariantConfig';

describe('useShadowVariantConfig — FP-054 54.1 export surface', () => {
  it('exports the hook function', () => {
    expect(typeof useShadowVariantConfig).toBe('function');
  });
});