/**
 * AdminApiConnectionsPage — ACT-523. Superadmin-only inventory of every
 * external API surface the platform depends on.
 *
 * Route: /admin/api-connections
 * Permission: admin.config (route gate) + isSuperadmin (page gate),
 * mirroring AdminSecurityPage byte-for-byte.
 *
 * Security invariants:
 *   - No secret VALUES are read, transported, or rendered. Only env-key NAMES.
 *   - RLS on api_provider_registry restricts read/write to superadmin.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { AccessDenied } from '@/components/dashboard/AccessDenied';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { useUserRoles } from '@/hooks/useUserRoles';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plug, Info, ChevronDown, ChevronRight, Pencil, Save, X } from 'lucide-react';

interface ProviderRow {
  id: string;
  provider: string;
  product_tier: string;
  endpoint_classes: string[];
  env_key_names: string[];
  consumers: string[];
  strategy: string;
  feeds: string;
  freshness_source: string;
  cost_surface: boolean;
  cost_monthly_usd: number | null;
  notes: string | null;
}

interface FreshnessRow {
  provider: string;
  product_tier: string;
  freshness_source: string;
  last_seen_at: string | null;
}

const REGISTRY_KEY = ['admin', 'api-provider-registry'] as const;
const FRESHNESS_KEY = ['admin', 'api-provider-freshness'] as const;

function formatWhen(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 48) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export default function AdminApiConnectionsPage() {
  const { isSuperadmin, loading: rolesLoading } = useUserRoles();
  const [showPlatform, setShowPlatform] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ cost: string; notes: string }>({ cost: '', notes: '' });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const registryQuery = useQuery({
    queryKey: REGISTRY_KEY,
    queryFn: async (): Promise<ProviderRow[]> => {
      const { data, error } = await supabase
        .from('api_provider_registry')
        .select('*')
        .order('cost_surface', { ascending: false })
        .order('provider');
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
    enabled: isSuperadmin,
    staleTime: 60_000,
  });

  const freshnessQuery = useQuery({
    queryKey: FRESHNESS_KEY,
    queryFn: async (): Promise<FreshnessRow[]> => {
      const { data, error } = await supabase.rpc('get_api_provider_freshness');
      if (error) throw error;
      return (data ?? []) as FreshnessRow[];
    },
    enabled: isSuperadmin,
    staleTime: 60_000,
  });

  const freshnessMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const f of freshnessQuery.data ?? []) {
      m.set(`${f.provider}|${f.product_tier}`, f.last_seen_at);
    }
    return m;
  }, [freshnessQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, cost, notes }: { id: string; cost: number | null; notes: string | null }) => {
      const { error } = await supabase
        .from('api_provider_registry')
        .update({ cost_monthly_usd: cost, notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
      toast({ title: 'Saved', description: 'Cost and notes updated.' });
      setEditingId(null);
    },
    onError: (e: Error) => {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    },
  });

  const rows = useMemo(() => {
    const all = registryQuery.data ?? [];
    return showPlatform ? all : all.filter((r) => r.cost_surface);
  }, [registryQuery.data, showPlatform]);

  const totalCost = useMemo(
    () => rows.reduce((sum, r) => sum + (r.cost_monthly_usd ?? 0), 0),
    [rows],
  );

  if (rolesLoading) return <LoadingSkeleton />;
  if (!isSuperadmin) {
    return <AccessDenied message="Only superadmins can view the API connections registry." />;
  }
  if (registryQuery.isLoading) return <LoadingSkeleton />;
  if (registryQuery.error) return <ErrorState message={(registryQuery.error as Error).message} />;

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const beginEdit = (row: ProviderRow) => {
    setEditingId(row.id);
    setEditDraft({
      cost: row.cost_monthly_usd?.toString() ?? '',
      notes: row.notes ?? '',
    });
  };

  const saveEdit = (id: string) => {
    const parsed = editDraft.cost.trim() === '' ? null : Number(editDraft.cost);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast({ title: 'Invalid cost', description: 'Enter a non-negative number or leave blank.', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({ id, cost: parsed, notes: editDraft.notes.trim() === '' ? null : editDraft.notes });
  };

  const columns: DataTableColumn<ProviderRow>[] = [
    {
      key: 'expander',
      header: '',
      className: 'w-8',
      cell: (row) => (
        <button
          type="button"
          aria-label={expanded.has(row.id) ? 'Collapse' : 'Expand'}
          onClick={(e) => { e.stopPropagation(); toggleRow(row.id); }}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded.has(row.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.provider}</span>
          <span className="text-xs text-muted-foreground">{row.product_tier}</span>
        </div>
      ),
    },
    {
      key: 'strategy',
      header: 'Strategy',
      cell: (row) => <Badge variant="outline">{row.strategy}</Badge>,
    },
    {
      key: 'env_keys',
      header: 'Env Key Names',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.env_key_names.map((k) => (
            <code key={k} className="rounded bg-muted px-1.5 py-0.5 text-xs">{k}</code>
          ))}
        </div>
      ),
    },
    {
      key: 'freshness',
      header: 'Last Seen',
      cell: (row) => {
        const src = row.freshness_source;
        if (src === 'none') return <span className="text-xs text-muted-foreground">none</span>;
        if (src === 'n_a_self') return <span className="text-xs text-muted-foreground">n/a (self)</span>;
        const last = freshnessMap.get(`${row.provider}|${row.product_tier}`);
        const label = src.startsWith('indirect_') ? `${formatWhen(last ?? null)} (${src})` : formatWhen(last ?? null);
        return <span className="text-xs font-mono">{label}</span>;
      },
    },
    {
      key: 'cost',
      header: '$/mo',
      numeric: true,
      cell: (row) => row.cost_monthly_usd != null ? `$${row.cost_monthly_usd.toFixed(2)}` : '—',
    },
    {
      key: 'annualized',
      header: '$/yr',
      numeric: true,
      cell: (row) => row.cost_monthly_usd != null ? `$${(row.cost_monthly_usd * 12).toFixed(2)}` : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Connections"
        subtitle="External API inventory, telemetry sources, and monthly cost ledger"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Superadmin-only. Only env-key <strong>names</strong> are shown — no secret values are read or transported.
          Cost and notes are editable; all other fields are code-grounded inventory. Freshness timestamps come from the
          declared telemetry source per row (labels like <code>indirect_*</code> and <code>n_a_self</code> are stamped honestly).
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              <CardTitle>Providers</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="show-platform" className="text-sm text-muted-foreground">
                Show platform rows (Turnstile / Lovable / Supabase-self)
              </Label>
              <Switch
                id="show-platform"
                checked={showPlatform}
                onCheckedChange={setShowPlatform}
              />
            </div>
          </div>
          <CardDescription>
            {rows.length} provider{rows.length === 1 ? '' : 's'} · Total tracked spend:{' '}
            <span className="font-mono">${totalCost.toFixed(2)}/mo</span> ·{' '}
            <span className="font-mono">${(totalCost * 12).toFixed(2)}/yr</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            columns={columns}
            data={rows}
            onRowClick={(row) => toggleRow(row.id)}
            emptyTitle="No providers"
            emptyDescription="Registry is empty."
          />

          {rows.filter((r) => expanded.has(r.id)).map((row) => (
            <Card key={`exp-${row.id}`} className="border-primary/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{row.provider} — details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Endpoint classes</div>
                  <div className="flex flex-wrap gap-1">
                    {row.endpoint_classes.map((c) => (
                      <code key={c} className="rounded bg-muted px-1.5 py-0.5 text-xs">{c}</code>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Consumers</div>
                  <ul className="list-disc pl-5 text-xs">
                    {row.consumers.map((c) => <li key={c}><code>{c}</code></li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Feeds</div>
                  <p className="text-sm">{row.feeds}</p>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">
                    Telemetry source (proves last-seen timestamp)
                  </div>
                  <code className="text-xs">{row.freshness_source}</code>
                </div>

                <div className="border-t pt-3">
                  {editingId === row.id ? (
                    <div className="space-y-2">
                      <div>
                        <Label htmlFor={`cost-${row.id}`} className="text-xs">Cost ($/mo)</Label>
                        <Input
                          id={`cost-${row.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={editDraft.cost}
                          onChange={(e) => setEditDraft((d) => ({ ...d, cost: e.target.value }))}
                          placeholder="0.00"
                          className="max-w-[160px]"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`notes-${row.id}`} className="text-xs">Notes</Label>
                        <Textarea
                          id={`notes-${row.id}`}
                          value={editDraft.notes}
                          onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveEdit(row.id)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="mr-1 h-4 w-4" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          <X className="mr-1 h-4 w-4" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Notes: </span>
                        {row.notes ? <span>{row.notes}</span> : <span className="italic text-muted-foreground">(none)</span>}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => beginEdit(row)}>
                        <Pencil className="mr-1 h-4 w-4" /> Edit cost / notes
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}