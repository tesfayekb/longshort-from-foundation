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
 * Owner: longshort (FP-045 — Phase 3+ / Phase 4 adds options-flow)
 */

import { registerPeadQueueConsumer } from '../../pead/pead-queue-registration.ts';
import { registerOptionsFlowQueueConsumer } from '../../options-flow/options-flow-queue-registration.ts';
import { registerNewsSentimentQueueConsumer } from '../../news-sentiment/news-sentiment-queue-registration.ts';
import { registerInsiderDailyConsumer } from '../../insider-transactions/insider-queue-bootstrap.ts';

// Phase 3 — PEAD (Signal #2 / FP-044).
registerPeadQueueConsumer();
// Phase 4 — options-flow (Signal #3 / FP-043; closes DW-095).
registerOptionsFlowQueueConsumer();
// FP-048 Phase 3b — news-sentiment (Signal #8 / FP-048; first
// sequential-feed consumer on the FP-045 engine).
registerNewsSentimentQueueConsumer();
// FP-050 Phase 3.6b.iii′ γ commit-2 — insider-transactions (Signal #4 /
// FP-050; first WORK-LIST consumer on the FP-045 engine). Registered in
// DAILY mode for slice/sweeper/cron/init-manual isolates; the BACKFILL
// mode is reachable only via the dedicated `longshort-insider-compute-
// manual` handler's per-request config build (registry never carries
// backfill mode — cross-mode contamination test pins this invariant).
registerInsiderDailyConsumer();