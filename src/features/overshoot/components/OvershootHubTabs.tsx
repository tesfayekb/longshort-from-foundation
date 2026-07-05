/**
 * OvershootHubTabs — FP-069 W4.h (ACT-465.h) overshoot-owned tab primitive.
 *
 * DUPLICATE-BY-DESIGN. This is a byte-parallel of the longshort convention
 * at `src/pages/trading/longshort/hub/HubTabs.tsx` (verified 2026-07-05,
 * see UniverseHubPage.tsx:2/:18 census reference in the W4.h ruling).
 * Per the FP-069 Separation Contract enforced by
 * `scripts/check-overshoot-separation.ts`, overshoot code MUST NOT import
 * from the longshort tree — so the shape is re-declared here rather than
 * imported. INC-77 duplicate-primitive discipline applies: the two files
 * are intentional twins; if the longshort shape evolves, mirror it here
 * deliberately.
 *
 * Wraps shadcn `@/components/ui/tabs` (the same primitive HubTabs wraps)
 * and round-trips the active tab through `?tab=<slug>` so links are
 * shareable and browser back/forward works. Unknown / missing values
 * fall back to `defaultTab`.
 */
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReactNode } from 'react';

export interface OvershootHubTab {
  /** URL slug used in `?tab=` */
  value: string;
  /** Display label on the tab trigger */
  label: string;
  /** Rendered tab content */
  content: ReactNode;
}

interface OvershootHubTabsProps {
  tabs: OvershootHubTab[];
  /** Default tab when no `?tab=` is present or the value is unknown */
  defaultTab: string;
  /** Query-param key (defaults to `tab`) */
  paramKey?: string;
}

export function OvershootHubTabs({
  tabs,
  defaultTab,
  paramKey = 'tab',
}: OvershootHubTabsProps) {
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

interface OvershootHubEmptyStateProps {
  title: string;
  description: string;
  note?: string;
}

/** Honest empty-state used by tabs whose data pipes land in later FPs. */
export function OvershootHubEmptyState({
  title,
  description,
  note,
}: OvershootHubEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        {description}
      </p>
      {note && (
        <p className="mt-3 text-xs text-muted-foreground/80 font-mono">{note}</p>
      )}
    </div>
  );
}