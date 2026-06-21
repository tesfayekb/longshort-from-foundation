/**
 * ShadowMeasurementPage — FP-054 sub-step 54.2.
 *
 * Thin page wrapper mounted as the `shadow` tab of the Reconciliation
 * hub. The actual panel lives in the strategy module
 * (`@/features/longshort/components/shadow/ShadowMeasurementPanel`)
 * per DEC-061 strategy-tier confinement.
 */
import { ShadowMeasurementPanel } from '@/features/longshort/components/shadow/ShadowMeasurementPanel';

export default function ShadowMeasurementPage() {
  return <ShadowMeasurementPanel />;
}