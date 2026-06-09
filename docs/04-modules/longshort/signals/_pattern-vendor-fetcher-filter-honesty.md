# Pattern: `verifyFilterHonored()` — vendor-endpoint filter-honesty pre-flight

> **Owner:** longshort / signals | **Originated at:** FP-042 second-addendum / ACT-156 (2026-06-09) | **Authority:** INC-70 + FP-042 | **Status:** mandatory pre-flight for every vendor-endpoint fetcher built from now on (Signals #1 / #2 / #3 / #8 + DW-094 EDGAR rebuild)

## The lesson

Polygon `/stocks/filings/vX/form-4` returned **byte-identical 1.85 MB / 1000-row firehose responses** for `ticker=AAPL`, `ticker.any_of=AAPL,MSFT,NVDA`, comma-lists, `ticker.in`, pipe-delimited, repeated-param, market-wide 90-day, AND market-wide 14-day (INC-70, 9-variant probe). The `ticker=` filter — documented and assumed-working — is silently ignored at our entitlement tier. `transaction_date.gte/lte` is also silently ignored. Only `limit=` is honored.

The original FP-042 per-ticker Form 4 fetcher therefore produced a **phantom signal**: fetched the same firehose 839 times, locally filtered by `tickers[0]===ticker`, yielded ~0 rows per name (the firehose is dominated by recent high-volume filers, not our S&P 900 universe), and the compute layer marked each name `no_qualifying_transactions` — **perfectly indistinguishable from the expected sparse profile**. The signal looked like it was working, was producing systematically wrong data, and would have remained invisible indefinitely if the ACT-155 market-wide rewrite hadn't hit the 50-page CPU cap and forced an investigation.

**Class lesson.** A 200-status response with a well-formed JSON payload is *not* evidence that the documented filters were honored. Silently-honored-but-broken filters are the most dangerous failure mode because every other surface looks healthy. The phantom-signal exposure was closed only by an unrelated operational failure (CPU cap) — pure luck, not pure rigor.

## The discipline — `verifyFilterHonored()` pre-flight

Every vendor-endpoint fetcher MUST implement a `verifyFilterHonored()` self-check that runs before the fetcher is trusted in any production code path. The check probes the endpoint with a filter value that **should return zero rows** and asserts the response is empty.

### Required probe shapes (run BOTH on every new fetcher)

1. **Impossible-key probe.** Issue the documented filter with a value that can never match (e.g. `ticker=ZZZZZZZZ`, `cik=9999999999`, `id=00000000-0000-0000-0000-000000000000`). Assert response has zero rows (`results.length === 0` or the endpoint's empty-shape equivalent). If the response returns any rows, the filter is silently ignored.
2. **Far-future-date probe.** Issue the documented date filter with a window that cannot contain real data (e.g. `gte=2099-01-01&lte=2099-01-02`). Assert response has zero rows. If the response returns rows from a different window (or the same payload as a present-day query), the date filter is silently ignored.

If EITHER probe returns non-zero rows, the fetcher MUST refuse to construct (throw at constructor time) — silently-ignored-filter is a constructor-time fatal contract violation, not a runtime degraded state. Surface the probe response shape (status, byte count, row count) in the thrown message for diagnosis.

### Where it runs

- **Dev / probe mode (mandatory).** Run on every fetcher build (`bun add` / new fetcher PR). Test surface lives next to the fetcher (`*_test.ts` with a `verifyFilterHonored` Deno test that hits the live endpoint with a sandbox-marked key, or a mocked-response variant for CI determinism).
- **Constructor-time self-check (recommended).** When the fetcher is instantiated in an edge function (production or manual handler), the constructor MAY run `verifyFilterHonored()` once per cold-boot and cache the result. Use sparingly — adds one HTTPS round-trip per cold-boot. Justified for high-stakes fetchers (financial-critical signals); skippable for fetchers backed by other safety nets (e.g. pre-validated curated datasets).
- **PR review (always).** Reviewer asks: "Where is `verifyFilterHonored()` for this fetcher? What's the assertion shape? When was it last run live?" If the answer is "we trust the docs", the PR is incomplete.

### Reference shape (informative)

```ts
// One concrete shape — adapt per endpoint.
export async function verifyFilterHonored(
  baseUrl: string,
  apiKey: string,
): Promise<void> {
  const probes = [
    { label: 'impossible-ticker', qs: 'ticker=ZZZZZZZZ&limit=10' },
    { label: 'far-future-date', qs: 'date.gte=2099-01-01&date.lte=2099-01-02&limit=10' },
  ];
  for (const p of probes) {
    const url = `${baseUrl}?${p.qs}&apiKey=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`verifyFilterHonored[${p.label}]: HTTP ${resp.status}`);
    }
    const body = await resp.json() as { results?: unknown[] };
    const rows = body.results ?? [];
    if (rows.length > 0) {
      throw new Error(
        `verifyFilterHonored[${p.label}]: filter SILENTLY IGNORED — ` +
          `expected 0 rows, got ${rows.length}. Refusing to construct fetcher.`,
      );
    }
  }
}
```

## Where this binds going forward

This pattern is a **§22.3-style pre-flight item** for every remaining vendor-endpoint signal FP. Specifically:

| Signal | Vendor endpoint | Filter to verify |
|---|---|---|
| #1 Analyst revisions | Polygon `/v3/reference/financials` or analyst-ratings endpoint | `ticker=` (per-name), `date=` window |
| #2 PEAD (post-earnings drift) | Polygon `/v3/reference/financials` (earnings dates) + price | `ticker=` + `period=` (annual/quarter) |
| #3 Options skew | Polygon options chain endpoints | `underlying_ticker=`, `expiration_date=` |
| #8 News sentiment | Polygon `/v2/reference/news` or NLP vendor | `tickers=` (multi), `published_utc.gte/lte` |
| **#4 Insider (DW-094 rebuild)** | SEC EDGAR `data.sec.gov/submissions/CIK*.json` | `CIK={cik10}` (per-issuer), `form='4'` |

Each fetcher's PR MUST include `verifyFilterHonored()` test evidence. Without it, the PR is structurally identical to the FP-042 pre-INC-70 state — green-looking and silently wrong.

## Cross-references

- INC-70 (the incident that motivated this pattern — 9-variant probe evidence).
- DW-094 (the EDGAR-based Signal #4 rebuild — first consumer of this pattern).
- FP-042 (the implementing FP whose fetcher this pattern would have saved).
- ACT-156 (the disarm + pattern-codification PR).
- `_shared/longshort-signals/shared/polygon-form4-fetcher.ts` (the broken-fetcher exhibit — retained in code only as a debug-path artifact; not used by the (now-disarmed) orchestrator).
- `signal_compute_log.run_id='1021808b-4b1c-4b04-bb45-d989d56b5193'` (the diagnostic exhibit — 1678 skips for 839 tickers, the "impossible telemetry" tell that surfaced the upstream phantom).

## FP-043 extension — `verifyFieldsPresent()` companion (dual-axis discipline)

> **Added:** FP-043 / Signal #3 / ACT-157 (2026-06-09) | **Authority:** INC-71 + FP-043 | **Binding on:** Signals #1 / #2 / #8 (every remaining vendor-endpoint fetcher).

### The second axis: filter-honored is necessary, not sufficient

FP-043's Tradier vetting added a second class of phantom: **filter-honored but key-fields-absent**. INC-71 captured the precedent — the Polygon Options Developer tier honored `underlying_ticker=` and `expiration_date=` correctly, but every quote in the response returned `bid=null`, `ask=null`, `last=null`, and `greeks=null` because real-time NBBO is a separate (paid) entitlement. A naive consumer that only ran `verifyFilterHonored()` would have happily ingested 100% well-shaped, 100% structurally-empty payloads — and the downstream compute would silently classify every contract as `no_qualifying_flow` (the smart-money filter trips on `volume>=100` against `volume=null`). Same phantom-signal class as INC-70, different surface.

The discipline therefore has **two axes** and both are mandatory:

1. **Axis 1 — `verifyFilterHonored()` (INC-70 origin).** Documented filters are actually honored. Probe with impossible-key + far-future-date; assert zero rows.
2. **Axis 2 — `verifyFieldsPresent()` (INC-71 origin).** Required numeric / object fields are actually populated on a known-good probe. Probe with a high-liquidity symbol that MUST return live values (e.g. SPY options for an options endpoint, AAPL daily bar for an equities endpoint); assert the fields the signal compute consumes are non-null on ≥ a threshold fraction of returned rows (FP-043 used `>= 90/118` numeric bid+ask on a 118-strike SPY chain probe).

Axis 1 catches "the endpoint returned a firehose under the guise of a filter." Axis 2 catches "the filter worked, but the fields the formula needs are gated behind a different entitlement." Either alone leaves a phantom-signal path open.

### Reference shape (informative)

```ts
export async function verifyFieldsPresent(
  baseUrl: string,
  apiKey: string,
  requiredNumericFields: string[],   // e.g. ['bid', 'ask', 'last', 'volume']
  requiredObjectFields: string[],    // e.g. ['greeks']
  knownGoodQuery: string,            // e.g. 'symbol=SPY&expiration=YYYY-MM-DD'
  minNumericFraction = 0.9,
): Promise<void> {
  const resp = await fetch(`${baseUrl}?${knownGoodQuery}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`verifyFieldsPresent: HTTP ${resp.status}`);
  const rows = extractRows(await resp.json());           // endpoint-specific
  if (rows.length === 0) {
    throw new Error('verifyFieldsPresent: known-good probe returned zero rows');
  }
  for (const field of requiredNumericFields) {
    const populated = rows.filter((r) => Number.isFinite(r[field])).length;
    if (populated / rows.length < minNumericFraction) {
      throw new Error(
        `verifyFieldsPresent: field '${field}' populated on ` +
          `${populated}/${rows.length} rows (< ${minNumericFraction * 100}%) — ` +
          `entitlement gated. Refusing to construct fetcher.`,
      );
    }
  }
  for (const field of requiredObjectFields) {
    const populated = rows.filter((r) => r[field] && typeof r[field] === 'object').length;
    if (populated < rows.length) {
      throw new Error(
        `verifyFieldsPresent: field '${field}' populated on ` +
          `${populated}/${rows.length} rows (expected all) — entitlement gated.`,
      );
    }
  }
}
```

### Per-signal field requirements (forward-binding)

| Signal | Endpoint | Axis-2 required fields | Known-good probe |
|---|---|---|---|
| #1 Analyst revisions | analyst-ratings vendor | numeric: `target_price`, `prior_target` | dense-coverage mega-cap (AAPL) |
| #2 PEAD | earnings + price | numeric: `eps_actual`, `eps_estimate`, `report_date` | last full earnings season window |
| #3 Options flow (FP-043) | Tradier `/v1/markets/options/chains` | numeric: `bid`, `ask`, `last`, `volume`, `open_interest`; object: `greeks` | SPY nearest-expiration |
| #8 News sentiment | news vendor + NLP | numeric: `sentiment_score`; object: `tickers[]` | trailing-24h window on liquid name |

Without Axis-2 evidence in the PR, the fetcher is presumed phantom-prone.

## Cross-references (added FP-043)

- INC-71 — Polygon Options Developer tier returns well-shaped but NBBO-absent payloads (the second-axis exhibit).
- FP-043 / ACT-157 — Tradier vetting that produced this axis (4-axis vendor probe: reachability + entitlement + filter-honored + fields-present).
- `_shared/longshort-signals/shared/tradier-options-chain-fetcher.ts` — first fetcher to embed both verifyFilterHonored and verifyFieldsPresent self-checks.