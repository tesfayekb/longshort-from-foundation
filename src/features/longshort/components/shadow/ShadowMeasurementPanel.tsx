/**
 * ShadowMeasurementPanel — FP-054 sub-step 54.2.
 *
 * L2 Shadow-Measurement panel rendered as the `shadow` tab of the
 * Reconciliation hub (`/trading/longshort/reconciliation?tab=shadow`).
 * Composes 54.1 hooks + `paired-diff-stats` helper into AC1-AC9
 * readouts under DEC-061 strategy-tier confinement (NO admin import).
 *
 * AC7 (LOAD-BEARING): the 11 relaxed arms render as an exploratory
 * landscape; descriptive stats only; no gate / pass-fail badge; no
 * ranking-by-edge; persistent banner verbatim per DEC-059 §1a + §5;
 * registration-of-record at v1 renders "none registered" (Fork A).
 *
 * AC6 / F4: freshness is DATA-DERIVED (max as_of_date / max horizon
 * close); NEVER reads `cron_last_fire`.
 *
 * Strategy-tier confinement: imports only `@/features/longshort/**`
 * + `@/components/ui/**` + `@/lib/utils` (the latter is platform-
 * neutral). No `@/components/dashboard`, no admin/platform imports.
 */
import { useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useShadowHealDate } from '@/features/longshort/hooks/useShadowHealDate';
import {
  useShadowVariantConfig,
  type ShadowVariantConfigRow,
} from '@/features/longshort/hooks/useShadowVariantConfig';
import { useShadowBookHead } from '@/features/longshort/hooks/useShadowBookHead';
import { useShadowForwardReturnsPaired } from '@/features/longshort/hooks/useShadowForwardReturnsPaired';
import { useShadowFetchErrorClusters } from '@/features/longshort/hooks/useShadowFetchErrorClusters';
import { useShadowFreshness } from '@/features/longshort/hooks/useShadowFreshness';
import { useVariantRegistration } from '@/features/longshort/hooks/useVariantRegistration';
import { computePairedDiffStats } from '@/features/longshort/services/stats/paired-diff-stats';

const BASELINE_ARM = 'gated_k0';
const N_GATE = 30;

/** AC7 banner — VERBATIM per FP-054 spec. Do not edit copy. */
export const SHADOW_AC7_BANNER =
  'Exploratory measurement landscape. The DEC-059 §1a promotion gate evaluates a single pre-specified variant at a pre-specified monthly checkpoint. No arm shown here is gate-evaluable absent a pre-registration of record.';

/** Neutral arm order: by inclusion_rule then k. NEVER by edge / significance. */
export function orderArmsNeutrally(
  variants: readonly ShadowVariantConfigRow[] | null | undefined,
): ShadowVariantConfigRow[] {
  return [...(variants ?? [])]
    .filter((v) => v.variant !== BASELINE_ARM)
    .sort(
      (a, b) =>
        a.inclusion_rule.localeCompare(b.inclusion_rule) || a.k - b.k,
    );
}

function fmtPct(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}
function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return x.toFixed(digits);
}
function fmtDate(x: string | null | undefined): string {
  return x ?? '—';
}

// ───────────────────────────── Freshness strip ─────────────────────────────

function FreshnessStrip() {
  const { data, isLoading, error } = useShadowFreshness();
  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Freshness unavailable</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <div className="font-mono text-xs">
        Shadow book through{' '}
        <span className="font-semibold">{fmtDate(data?.shadowBookThrough)}</span>
        ; forward returns matured through{' '}
        <span className="font-semibold">
          {fmtDate(data?.forwardReturnsMaturedThrough)}
        </span>
        .
      </div>
      <a
        href="/admin/jobs"
        className="text-xs underline text-muted-foreground hover:text-foreground"
      >
        Cron health → /admin/jobs
      </a>
    </div>
  );
}

// ─────────────────────── Registration of record (Fork A) ───────────────────

function RegistrationOfRecord() {
  const { data } = useVariantRegistration();
  const reg = data?.registration ?? null;
  if (!reg) {
    return (
      <div
        className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
        data-testid="registration-of-record"
        data-registered="false"
      >
        No confirmatory pre-registration of record — all arms exploratory.
      </div>
    );
  }
  return (
    <div
      className="rounded-md border bg-muted/20 px-3 py-2 text-xs"
      data-testid="registration-of-record"
      data-registered="true"
      data-arm={reg.arm}
    >
      Pre-registered arm: <span className="font-semibold">{reg.arm}</span> ·
      registered {reg.registeredAt} by {reg.registeredBy} · checkpoint{' '}
      {reg.checkpointDate}
    </div>
  );
}

// ───────────────────────────── Per-arm stats row ───────────────────────────

interface ArmRowProps {
  arm: ShadowVariantConfigRow;
  healDate: string;
  registeredArm: string | null;
}

function ArmRow({ arm, healDate, registeredArm }: ArmRowProps) {
  const t1 = useShadowForwardReturnsPaired(arm.variant, 1, healDate, BASELINE_ARM);
  const t5 = useShadowForwardReturnsPaired(arm.variant, 5, healDate, BASELINE_ARM);
  const t20 = useShadowForwardReturnsPaired(arm.variant, 20, healDate, BASELINE_ARM);

  const s1 = useMemo(() => computePairedDiffStats(t1.data?.paired ?? []), [t1.data]);
  const s5 = useMemo(() => computePairedDiffStats(t5.data?.paired ?? []), [t5.data]);
  const s20 = useMemo(() => computePairedDiffStats(t20.data?.paired ?? []), [t20.data]);

  const loading = t1.isLoading || t5.isLoading || t20.isLoading;
  const isRegistered = registeredArm !== null && registeredArm === arm.variant;
  // n gate readout uses T+5 primary per AC2/DEC-059 §1a.
  const n = s5.n;

  return (
    <TableRow data-arm={arm.variant}>
      <TableCell className="font-mono text-xs">
        {arm.variant}
        {isRegistered && (
          <Badge variant="secondary" className="ml-2">
            Registered
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-xs">
        {loading ? <Skeleton className="h-4 w-12 ml-auto" /> : `${n}/${N_GATE}`}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-xs">
        {loading ? (
          <Skeleton className="h-4 w-24 ml-auto" />
        ) : (
          <>
            {fmtPct(s5.meanDiff)}
            <span className="block text-[10px] text-muted-foreground">
              95% CI [{fmtPct(s5.ci95Lo)}, {fmtPct(s5.ci95Hi)}]
            </span>
          </>
        )}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-xs">
        {loading ? <Skeleton className="h-4 w-16 ml-auto" /> : fmtPct(s1.meanDiff)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-xs">
        {loading ? <Skeleton className="h-4 w-16 ml-auto" /> : fmtPct(s20.meanDiff)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-xs">
        {loading ? <Skeleton className="h-4 w-12 ml-auto" /> : fmtNum(s5.tStat)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
        —
      </TableCell>
    </TableRow>
  );
}

// ───────────────────────────── Spread section (AC3 + AC7) ──────────────────

interface SpreadSectionProps {
  arms: ShadowVariantConfigRow[];
  healDate: string;
}

function SpreadSection({ arms, healDate }: SpreadSectionProps) {
  const { data: regData } = useVariantRegistration();
  const registeredArm = regData?.registration?.arm ?? null;

  return (
    <Card data-testid="spread-section">
      <CardHeader>
        <CardTitle className="text-base">Per-arm spread (paired vs baseline)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert data-testid="ac7-banner">
          <AlertTitle>Exploratory landscape</AlertTitle>
          <AlertDescription>{SHADOW_AC7_BANNER}</AlertDescription>
        </Alert>
        <RegistrationOfRecord />
        <Table data-testid="arms-table">
          <TableHeader>
            <TableRow>
              <TableHead>Arm</TableHead>
              <TableHead className="text-right">n (T+5)</TableHead>
              <TableHead className="text-right">T+5 edge ± 95% CI</TableHead>
              <TableHead className="text-right">T+1 edge</TableHead>
              <TableHead className="text-right">T+20 edge</TableHead>
              <TableHead className="text-right">t-stat (T+5)</TableHead>
              <TableHead className="text-right">Turnover</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {arms.map((arm) => (
              <ArmRow
                key={arm.variant}
                arm={arm}
                healDate={healDate}
                registeredArm={registeredArm}
              />
            ))}
          </TableBody>
        </Table>
        <p className="text-[11px] text-muted-foreground">
          Baseline: <span className="font-mono">{BASELINE_ARM}</span> (live_gated arm not yet accruing).
          Descriptive statistics only; n&lt;{N_GATE} is not gate-evaluable per DEC-059 §1a.
          Arms ordered by (inclusion_rule, k) — never by edge or significance.
        </p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── Fetch-error clusters (AC4) ────────────────────

function FetchErrorClustersSection() {
  const { data, isLoading, error } = useShadowFetchErrorClusters();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fetch-error clusters (~30d)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load fetch errors</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : !data || data.totalFailRows === 0 ? (
          <p className="text-sm text-muted-foreground">
            No price-source failures in the last 30 days.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                By status × seed day
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Seed day</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clusters.slice(0, 20).map((c) => (
                    <TableRow key={`${c.status}|${c.seed_as_of_date}`}>
                      <TableCell className="font-mono text-xs">{c.status}</TableCell>
                      <TableCell className="font-mono text-xs">{c.seed_as_of_date}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        {c.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Top persistent-fail tickers
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Fail-days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topPersistentTickers.map((t) => (
                    <TableRow key={t.ticker}>
                      <TableCell className="font-mono text-xs">{t.ticker}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        {t.fail_days}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────── Book head (AC5) ─────────────────────────────────

function BookHeadSection({ topK = 10 }: { topK?: number }) {
  const { data, isLoading, error } = useShadowBookHead();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Latest shadow book head (top {topK} per side)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load book head</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shadow book rows yet.</p>
        ) : (
          <div className="space-y-4">
            {data.map((entry) => (
              <div key={entry.variant} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold">{entry.variant}</span>
                  <span className="font-mono text-muted-foreground">
                    as of {entry.as_of_date}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <SideTable side="long" rows={entry.longs.slice(0, topK)} />
                  <SideTable side="short" rows={entry.shorts.slice(0, topK)} />
                </div>
                <Separator />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SideTable({
  side,
  rows,
}: {
  side: 'long' | 'short';
  rows: ReadonlyArray<{ ticker: string; rank_within_side: number; score: number }>;
}) {
  return (
    <div>
      <h5 className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
        {side}
      </h5>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Ticker</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-xs text-muted-foreground">
                None
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={`${side}-${r.rank_within_side}-${r.ticker}`}>
                <TableCell className="font-mono text-xs">{r.rank_within_side}</TableCell>
                <TableCell className="font-mono text-xs">{r.ticker}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {fmtNum(r.score, 4)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ───────────────────────────── Degradation states (AC9) ────────────────────

function DegradationCard({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        {note && (
          <p className="mt-3 font-mono text-xs text-muted-foreground/80">{note}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────── Main panel ──────────────────────────────────

export function ShadowMeasurementPanel() {
  const heal = useShadowHealDate();
  const variants = useShadowVariantConfig();

  const arms = useMemo(() => orderArmsNeutrally(variants.data), [variants.data]);

  if (heal.isLoading || variants.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (heal.error || variants.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Shadow panel unavailable</AlertTitle>
        <AlertDescription>
          {(heal.error as Error | null)?.message ??
            (variants.error as Error | null)?.message ??
            'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  const healDate = heal.data ?? null;

  // AC9 — Pre-heal: clock not started.
  if (!healDate) {
    return (
      <div className="space-y-4" data-testid="shadow-state-pre-heal">
        <FreshnessStrip />
        <DegradationCard
          title="Measurement clock not started"
          description="Awaiting DW-106 short-interest carry heal. n shown as 0/30 until the first carry-cron fire stamps the heal_date."
          note="State: pre-heal"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="shadow-state-armed">
      <FreshnessStrip />
      <SpreadSection arms={arms} healDate={healDate} />
      <FetchErrorClustersSection />
      <BookHeadSection />
    </div>
  );
}

export default ShadowMeasurementPanel;