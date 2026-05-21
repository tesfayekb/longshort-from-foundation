/**
 * Long-Short Strategy Module — public API façade
 *
 * This file is the SOLE sanctioned entry point for any module outside
 * `src/features/longshort/` that legitimately needs to reference long-short
 * strategy artifacts. Per DEC-031 sub-point 6, the ONLY external file
 * authorized to import from this façade is `src/config/trading-navigation.ts`
 * (the trading-panel-infrastructure carve-out for nav/RBAC-key registration).
 * Per the T1 contract in `docs/04-modules/strategy-module-pattern.md`, the
 * final export surface of this file is exactly three names:
 *
 *   - longshortNav                 (NavSection descriptor; added in Step 5.5)
 *   - LONGSHORT_PERMISSION_KEYS    (frozen array of permission keys; added in Step 5.2)
 *   - LongShortDashboardPage       (routed page component re-export; added in Step 5.5)
 *
 * No other names may be exported. Strategy internals (services, hooks, types,
 * utils, internal components) MUST NOT be exported. Reaching inside this
 * folder from outside is a Constitution Rule 3 violation.
 *
 * Step 5.4 status: stub — directory scaffold lands; exports populated by
 * Step 5.2 (LONGSHORT_PERMISSION_KEYS) and Step 5.5 (longshortNav,
 * LongShortDashboardPage).
 */

export {};