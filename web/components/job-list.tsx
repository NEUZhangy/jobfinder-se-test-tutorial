import { BookmarkIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Job } from "@/api";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysAgo, fitPct, fitTier } from "@/lib/fit";
import { cn } from "@/lib/utils";

export const FILTERS = {
  all: { label: "All", keep: (j: Job) => j.mark !== "hidden" },
  top: { label: "Top", keep: (j: Job) => j.mark !== "hidden" && (j.fit ?? 0) >= 2 },
  saved: { label: "Saved", keep: (j: Job) => j.mark === "saved" },
  hidden: { label: "Hidden", keep: (j: Job) => j.mark === "hidden" },
} as const;
export type Filter = keyof typeof FILTERS;

type Props = {
  jobs: Job[];
  allJobs: Job[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  query: string;
  onQuery: (q: string) => void;
};

export function JobList({ jobs, allJobs, loading, selectedId, onSelect, filter, onFilter, query, onQuery }: Props) {
  const strong = allJobs.filter((j) => j.mark !== "hidden" && j.fit === 3).length;
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">
            {strong} strong {strong === 1 ? "match" : "matches"}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">{jobs.length} shown</span>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => onFilter(v as Filter)}>
            <TabsList>
              {Object.entries(FILTERS).map(([key, f]) => (
                <TabsTrigger key={key} value={key}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search" value={query} onChange={(e) => onQuery(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading &&
          Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="border-b px-3 py-3">
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        {!loading && jobs.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No jobs here. Try another filter or widen the scope.</p>
        )}
        {!loading &&
          jobs.map((j) => {
            const selected = j.id === selectedId;
            return (
              <button
                key={j.id}
                ref={selected ? selectedRef : undefined}
                onClick={() => onSelect(j.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors",
                  selected ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 w-9 shrink-0 rounded-md py-0.5 text-center text-xs font-semibold tabular-nums",
                    j.fit == null ? "bg-muted text-muted-foreground" : fitTier(j.fit).pill,
                  )}
                >
                  {j.fit == null ? "–" : fitPct(j.fit)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{j.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {j.company} · {j.locations[0]}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted-foreground">
                  {daysAgo(j.date_posted)}
                  {j.mark === "saved" && <BookmarkIcon className="size-3 fill-current text-foreground" />}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
