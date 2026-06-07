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
 * URL-synced in-page tabs for longshort hubs.
 *
 * FP-023: round-trips the active tab through `?tab=<slug>` so links are
 * shareable and browser back/forward works. Unknown / missing values fall
 * back to `defaultTab`.
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

/** Honest empty-state used by tabs whose data pages land in later FPs. */
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