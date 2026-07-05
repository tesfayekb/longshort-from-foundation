/**
 * OvershootHubTabs — overshoot-internal duplicate of the longshort
 * `HubTabs` + `HubEmptyState` primitives.
 *
 * DUPLICATION RATIONALE (INC-77 sibling precedent, W4.b-FIX / ACT-465.b-FIX):
 * The overshoot→longshort import
 *   `import { HubTabs, HubEmptyState } from '@/pages/trading/longshort/hub/HubTabs'`
 * introduced at W4.a violates the FP-069 Separation Contract enforced by
 * `scripts/check-overshoot-separation.ts` (the "overshoot-guards" CI job).
 * `HubTabs` is a presentation primitive, NOT one of the A3-ratified leaf
 * utilities on the allowlist; extending the allowlist would require a
 * charter amendment. Per the INC-77 sibling precedent used for broker
 * clients + leaf tree membrane, the fix is DUPLICATION, not import:
 * this file is a byte-for-byte port of the longshort primitive, owned by
 * the overshoot module, and the dashboard is repointed here. Zero
 * longshort bytes touched; the guard flips green with zero charter
 * change.
 *
 * DRIFT-AUDIT NOTE: this file MUST stay behaviorally aligned with
 * `src/pages/trading/longshort/hub/HubTabs.tsx` until an operator
 * ratifies otherwise. Any intentional divergence (new prop, changed
 * URL-sync semantics, different empty-state markup) is a design decision
 * that must be recorded in `docs/06-tracking/incidental-findings.md` and
 * cross-referenced from the module doc. Cosmetic drift on the longshort
 * side is out of scope for the overshoot module (the two are now
 * independent by charter). Reviewers: diff the two files whenever either
 * one is touched and confirm the divergence is intentional.
 */
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReactNode } from 'react';

export interface HubTab {
  /** URL slug used in `?tab=` */
  value: string;
  /** Display label on the tab trigger */
  label: string;
  /** Rendered tab content */
  content: ReactNode;
}

interface HubTabsProps {
  tabs: HubTab[];
  /** Default tab when no `?tab=` is present or value is unknown */
  defaultTab: string;
  /** Query-param key (defaults to `tab`) — kept configurable for future hubs */
  paramKey?: string;
}

/**
 * URL-synced in-page tabs for overshoot hubs — behavioral mirror of the
 * longshort primitive (see file header for the duplication rationale).
 */
export function HubTabs({ tabs, defaultTab, paramKey = 'tab' }: HubTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(paramKey);
  const known = tabs.some((t) => t.value === raw);
  const active = known ? (raw as string) : defaultTab;

  return (
    <Tabs
      value={active}
      onValueChange={(v) => {
        const next = new URLSearchParams(searchParams);
        if (v === defaultTab) next.delete(paramKey);
        else next.set(paramKey, v);
        setSearchParams(next, { replace: true });
      }}
    >
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-6">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

interface HubEmptyStateProps {
  title: string;
  description: string;
  note?: string;
}

/** Honest empty-state used by tabs whose data pages land in later tranches. */
export function HubEmptyState({ title, description, note }: HubEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
      {note && (
        <p className="mt-3 text-xs text-muted-foreground/80 font-mono">{note}</p>
      )}
    </div>
  );
}