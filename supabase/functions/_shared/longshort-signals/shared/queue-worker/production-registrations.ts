/**
 * Production queue-worker consumer registrations — side-effect import
 * hub. Each of the four queue edge handlers (init, init-manual, slice,
 * sweeper) imports this module so `productionQueueRegistry` is populated
 * with every live consumer at isolate boot.
 *
 * Per the FP-045 Phase 2 addendum §1 (Consumer registration lives in the
 * consumer's own module) — this file only AGGREGATES, it never declares
 * config inline. Deleting a signal = deleting both its consumer module
 * AND its line here (T6 per-strategy removability discipline applies to
 * per-signal removability symmetrically).
 *
 * Owner: longshort (FP-045 — Phase 3+)
 */

import { registerPeadQueueConsumer } from '../../pead/pead-queue-registration.ts';

// Phase 3 — PEAD (Signal #2 / FP-044). Phase 4 will add options-flow.
registerPeadQueueConsumer();