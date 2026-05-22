import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ConfirmActionDialog } from '@/components/dashboard/ConfirmActionDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { AlertOctagon, Pause, Play, Square } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

type KillSwitchRow = {
  operator_id: string;
  strategy_key: string;
  state: 'active' | 'soft_paused' | 'hard_paused' | 'liquidating';
  reason: string | null;
  set_by: string | null;
  set_at: string;
};

type Action = 'soft_pause' | 'hard_pause' | 'manual_liquidate' | 'resume';

const ACTION_RPC: Record<Action, string> = {
  soft_pause: 'kill_switch_soft_pause',
  hard_pause: 'kill_switch_hard_pause',
  manual_liquidate: 'kill_switch_manual_liquidate',
  resume: 'kill_switch_resume',
};

const ACTION_LABEL: Record<Action, string> = {
  soft_pause: 'Soft Pause',
  hard_pause: 'Hard Pause',
  manual_liquidate: 'Manual Liquidate',
  resume: 'Resume',
};

function stateBadge(state: KillSwitchRow['state']) {
  switch (state) {
    case 'active':
      return 'bg-success/10 text-success border-success/20';
    case 'soft_paused':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'hard_paused':
    case 'liquidating':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function AdminKillSwitchPage() {
  const queryClient = useQueryClient();
  const [newStrategy, setNewStrategy] = useState('');
  const [dialog, setDialog] = useState<{ strategy_key: string; action: Action } | null>(null);
  const [reason, setReason] = useState('');

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['admin', 'kill-switches'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('kill_switches')
        .select('*')
        .order('strategy_key');
      if (error) throw error;
      return (data ?? []) as KillSwitchRow[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: { strategy_key: string; action: Action; reason: string }) => {
      const fnName = ACTION_RPC[input.action];
      const { data, error } = await (supabase as any).rpc(fnName, {
        p_strategy_key: input.strategy_key,
        p_reason: input.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success(`${ACTION_LABEL[vars.action]} succeeded for ${vars.strategy_key}`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'kill-switches'] });
      setDialog(null);
      setReason('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Kill-switch action failed: ${msg}`);
    },
  });

  if (isLoading) return <LoadingSkeleton variant="page" />;
  if (error) return <ErrorState title="Failed to load kill switches" message={(error as Error).message} />;

  const knownStrategies = new Set((rows ?? []).map((r) => r.strategy_key));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kill Switches"
        description="Platform-tier emergency controls for all strategies. Soft-pause halts new entries; hard-pause halts all activity; manual-liquidate initiates position unwind (Phase 5)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-destructive" />
            Active Kill Switches
          </CardTitle>
          <CardDescription>
            All RPC actions require superadmin role. Each action emits an audit_logs row and is reauth-gated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(rows ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No kill-switch rows yet. Trigger any action below to create one.</p>
          )}
          {(rows ?? []).map((row) => (
            <div
              key={`${row.operator_id}-${row.strategy_key}`}
              className="flex flex-col gap-2 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{row.strategy_key}</span>
                  <Badge variant="outline" className={stateBadge(row.state)}>
                    {row.state}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Set {format(new Date(row.set_at), 'yyyy-MM-dd HH:mm:ss')}
                  {row.reason ? ` · ${row.reason}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog({ strategy_key: row.strategy_key, action: 'soft_pause' })}
                >
                  <Pause className="mr-1 h-4 w-4" /> Soft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog({ strategy_key: row.strategy_key, action: 'hard_pause' })}
                >
                  <Square className="mr-1 h-4 w-4" /> Hard
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setDialog({ strategy_key: row.strategy_key, action: 'manual_liquidate' })}
                >
                  <AlertOctagon className="mr-1 h-4 w-4" /> Liquidate
                </Button>
                {row.state === 'soft_paused' && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setDialog({ strategy_key: row.strategy_key, action: 'resume' })}
                  >
                    <Play className="mr-1 h-4 w-4" /> Resume
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trigger action on a new strategy</CardTitle>
          <CardDescription>Creates a kill-switch row for a strategy that has no entry yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="strategy-key">Strategy key</Label>
            <Input
              id="strategy-key"
              placeholder="e.g. longshort"
              value={newStrategy}
              onChange={(e) => setNewStrategy(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!newStrategy || knownStrategies.has(newStrategy)}
              onClick={() => setDialog({ strategy_key: newStrategy, action: 'soft_pause' })}
            >
              Soft Pause
            </Button>
            <Button
              variant="outline"
              disabled={!newStrategy || knownStrategies.has(newStrategy)}
              onClick={() => setDialog({ strategy_key: newStrategy, action: 'hard_pause' })}
            >
              Hard Pause
            </Button>
            <Button
              variant="destructive"
              disabled={!newStrategy || knownStrategies.has(newStrategy)}
              onClick={() => setDialog({ strategy_key: newStrategy, action: 'manual_liquidate' })}
            >
              Manual Liquidate
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setReason('');
          }
        }}
        title={dialog ? `${ACTION_LABEL[dialog.action]} — ${dialog.strategy_key}` : ''}
        description="Provide a reason for the audit log. This action is logged and may be irreversible."
        confirmLabel={dialog ? ACTION_LABEL[dialog.action] : 'Confirm'}
        variant={dialog?.action === 'manual_liquidate' || dialog?.action === 'hard_pause' ? 'destructive' : 'default'}
        onConfirm={async () => {
          if (!dialog) return;
          await mutation.mutateAsync({ strategy_key: dialog.strategy_key, action: dialog.action, reason });
        }}
        isPending={mutation.isPending}
      >
        <div className="space-y-2 pt-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this action being taken?"
            rows={3}
          />
        </div>
      </ConfirmActionDialog>
    </div>
  );
}