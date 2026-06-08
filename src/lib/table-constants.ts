/**
 * FP-030 — Shared table presentation constants.
 *
 * `DEFAULT_PAGE_SIZE` is the canonical Long-Short table page size.
 * Every Long-Short table imports this constant rather than hardcoding
 * a magic number so a future change (e.g. raising it to 50 once the
 * Phase-2 dataset grows) lands in one place.
 *
 * Non-Long-Short consumers (e.g. admin `InvitationsTable`) explicitly
 * pass their own `pageSize` to `DataTable` and are intentionally
 * unaffected by this default.
 */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Page-size selector options for `DataTable`'s optional density-aware
 * pagination footer. Operator can flip between 25 / 50 / 100 rows when
 * a parent wires `onPageSizeChange`.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;