/**
 * OvershootConfigPanel — read + gated-edit surface for
 * `public.overshoot_strategy_config` (FP-069 W4.e, ACT-465.e).
 *
 * READ path: RLS-inheriting `SELECT` gated by `overshoot.view` (client
 * component sits behind `<PermissionGate permission="overshoot.view">`
 * at the route boundary).
 *
 * WRITE path: the console's SOLE mutation. Flows through the ratified
 * SECURITY DEFINER RPC `public.overshoot_update_strategy_config`
 * (mechanism (a) per operator ratification; three cited precedents:
 * `write_universe_eligibility_coverage`, `kill_switch_soft_pause`,
 * `promote_combiner_model`). Direct table UPDATEs from the browser are
 * refused by RLS + absence of authenticated GRANTs on the base table.
 *
 * Client-side edit gating uses `<RequirePermission permission="overshoot.manage">`
 * as a UX convenience (the Edit button is hidden for view-only callers);
 * server-side enforcement lives in the RPC body (`has_permission(...)` +
 * typed exception, checked BEFORE any bounds re-check / UPDATE / audit
 * INSERT). Bounds are re-validated client-side via zod AND inside the
 * RPC body — defense in depth mirroring the table's CHECK constraints
 * (`strategy_allocation_pct` in (0, 1]; `margin_multiplier` in [1.00, 2.00]).
 *
 * NO optimistic UI: the confirm dialog stays open on failure and surfaces
 * the destructive error verbatim; success renders the RPC-returned row
 * (the authoritative post-update snapshot) and refreshes the read cache.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircle, PencilLine } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface OvershootConfigRow {
  account_key: string;
  strategy_allocation_pct: number;
  margin_multiplier: number;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Bounds mirror the table CHECKs verbatim. The RPC re-validates internally.
 * Exported for the test file so client + server bounds stay lock-step.
 */
export const overshootConfigEditSchema = z.object({
  strategy_allocation_pct: z
    .number({ invalid_type_error: 'strategy_allocation_pct must be a number' })
    .gt(0, 'strategy_allocation_pct must be > 0')
    .lte(1, 'strategy_allocation_pct must be ≤ 1'),
  margin_multiplier: z
    .number({ invalid_type_error: 'margin_multiplier must be a number' })
    .gte(1.0, 'margin_multiplier must be ≥ 1.00')
    .lte(2.0, 'margin_multiplier must be ≤ 2.00'),
});

export type OvershootConfigEditInput = z.infer<typeof overshootConfigEditSchema>;

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function fmtAlloc(n: number): string {
  return `${(Number(n) * 100).toFixed(2)}%`;
}
function fmtMargin(n: number): string {
  return `${Number(n).toFixed(2)}×`;
}

export function OvershootConfigPanel() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ['overshoot-strategy-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_strategy_config')
        .select('account_key, strategy_allocation_pct, margin_multiplier, updated_at, updated_by')
        .order('account_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OvershootConfigRow[];
    },
  });

  const rows = configQuery.data ?? [];
  const [editing, setEditing] = useState<OvershootConfigRow | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Strategy configuration ({rows.length})</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only for <code>overshoot.view</code>. Edits require{' '}
            <code>overshoot.manage</code> and flow through the atomic{' '}
            <code>overshoot_update_strategy_config</code> RPC (write + audit in
            the same server-side transaction).
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {configQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : configQuery.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load config</AlertTitle>
            <AlertDescription>{String(configQuery.error)}</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              No overshoot_strategy_config rows visible under this session.
            </p>
            <p className="mt-2">
              Rows are seeded by migration; empty here means RLS is filtering
              them out or the seed has not landed for the target account.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Allocation</TableHead>
                <TableHead className="text-right">Margin ×</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Updated by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.account_key}>
                  <TableCell className="font-mono">{row.account_key}</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtAlloc(row.strategy_allocation_pct)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtMargin(row.margin_multiplier)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTs(row.updated_at)}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {row.updated_by ?? <Badge variant="outline">unattributed</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <RequirePermission
                      permission="overshoot.manage"
                      fallback={<Badge variant="outline">view-only</Badge>}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(row)}
                        aria-label={`Edit ${row.account_key}`}
                      >
                        <PencilLine className="mr-2 h-3 w-3" />
                        Edit
                      </Button>
                    </RequirePermission>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {editing ? (
        <OvershootConfigEditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSuccess={(updated) => {
            queryClient.setQueryData<OvershootConfigRow[]>(
              ['overshoot-strategy-config'],
              (prev) =>
                (prev ?? []).map((r) =>
                  r.account_key === updated.account_key ? updated : r
                )
            );
            void queryClient.invalidateQueries({ queryKey: ['overshoot-strategy-config'] });
            setEditing(null);
          }}
        />
      ) : null}
    </Card>
  );
}

interface EditDialogProps {
  row: OvershootConfigRow;
  onClose: () => void;
  onSuccess: (updated: OvershootConfigRow) => void;
}

export function OvershootConfigEditDialog({ row, onClose, onSuccess }: EditDialogProps) {
  const [alloc, setAlloc] = useState<string>(String(row.strategy_allocation_pct));
  const [margin, setMargin] = useState<string>(String(row.margin_multiplier));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const allocN = Number(alloc);
    const marginN = Number(margin);
    return overshootConfigEditSchema.safeParse({
      strategy_allocation_pct: allocN,
      margin_multiplier: marginN,
    });
  }, [alloc, margin]);

  const dirty =
    parsed.success &&
    (parsed.data.strategy_allocation_pct !== Number(row.strategy_allocation_pct) ||
      parsed.data.margin_multiplier !== Number(row.margin_multiplier));

  async function submit() {
    if (!parsed.success) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'overshoot_update_strategy_config',
        {
          p_account_key: row.account_key,
          p_allocation_pct: parsed.data.strategy_allocation_pct,
          p_margin_multiplier: parsed.data.margin_multiplier,
        }
      );
      if (rpcError) throw new Error(rpcError.message);
      if (!data) throw new Error('RPC returned no row (unexpected — server-side atomicity check failed)');
      toast.success('Overshoot config updated', {
        description: `${row.account_key}: alloc ${fmtAlloc(parsed.data.strategy_allocation_pct)}, margin ${fmtMargin(parsed.data.margin_multiplier)}`,
      });
      onSuccess(data as OvershootConfigRow);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error('Overshoot config update FAILED', { description: message });
      // NO optimistic UI: dialog stays open, error surfaces destructively.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit overshoot config — {row.account_key}</DialogTitle>
          <DialogDescription>
            Writes go through the atomic <code>overshoot_update_strategy_config</code>{' '}
            RPC (permission gate + bounds re-check + UPDATE + audit INSERT in one
            server-side transaction). No optimistic UI.
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alloc">
                Strategy allocation (0 &lt; x ≤ 1)
              </Label>
              <Input
                id="alloc"
                type="number"
                step="0.01"
                min="0.01"
                max="1"
                value={alloc}
                onChange={(e) => setAlloc(e.target.value)}
                aria-invalid={!parsed.success}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="margin">
                Margin multiplier (1.00 ≤ x ≤ 2.00)
              </Label>
              <Input
                id="margin"
                type="number"
                step="0.01"
                min="1"
                max="2"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                aria-invalid={!parsed.success}
              />
            </div>
            {!parsed.success ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Bounds violation</AlertTitle>
                <AlertDescription>
                  {parsed.error.issues.map((i) => i.message).join(' • ')}
                </AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                onClick={() => setConfirming(true)}
                disabled={!parsed.success || !dirty}
              >
                Review changes
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <p className="mb-2 font-medium">Diff (before → after)</p>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-xs">
                <dt className="text-muted-foreground">allocation</dt>
                <dd>{fmtAlloc(Number(row.strategy_allocation_pct))}</dd>
                <dd>→ {fmtAlloc(parsed.success ? parsed.data.strategy_allocation_pct : NaN)}</dd>
                <dt className="text-muted-foreground">margin</dt>
                <dd>{fmtMargin(Number(row.margin_multiplier))}</dd>
                <dd>→ {fmtMargin(parsed.success ? parsed.data.margin_multiplier : NaN)}</dd>
              </dl>
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>RPC failed — no change applied</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={submitting}
              >
                Back
              </Button>
              <Button onClick={submit} disabled={submitting || !parsed.success}>
                {submitting ? 'Submitting…' : 'Confirm & submit'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}