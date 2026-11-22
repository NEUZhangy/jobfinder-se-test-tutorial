import { BriefcaseBusinessIcon, PlayIcon, SettingsIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type AppState, type Job, type JobDetail as Detail, type Mark } from "@/api";
import { JobDetail } from "@/components/job-detail";
import { FILTERS, JobList, type Filter } from "@/components/job-list";
import { SettingsSheet } from "@/components/settings-sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;
  const jobsRequest = useRef(0);

  const shown = useMemo(() => jobs.filter(FILTERS[filter].keep), [jobs, filter]);
  const selected = shown.find((j) => j.id === selectedId) ?? shown[0] ?? null;

  const loadJobs = useCallback(async (q: string) => {
    const request = ++jobsRequest.current;
    try {
      const result = await api.jobs(q);
      if (request === jobsRequest.current) setJobs(result);
    } catch (e) {
      toast.error("Could not load jobs", { description: String((e as Error).message) });
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadState = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      return s;
    } catch (e) {
      toast.error("Could not load state", { description: String((e as Error).message) });
    }
  }, []);

  const refresh = useCallback(() => Promise.all([loadState(), loadJobs(queryRef.current)]).then(() => {}), [loadState, loadJobs]);

  useEffect(() => {
    void loadState().then((s) => s && !s.profile.hasResume && setSettingsOpen(true));
  }, [loadState]);

  useEffect(() => {
    const t = setTimeout(() => void loadJobs(query), 250);
    return () => clearTimeout(t);
  }, [query, loadJobs]);

  useEffect(() => {
    if (!selected || details[selected.id]?.pageStatus === selected.page_status) return;
    const { id, page_status } = selected;
    let live = true;
    api.job(id).then(
      (d) => live && setDetails((all) => ({ ...all, [id]: d })),
      (e) => {
        if (!live) return;
        toast.error("Could not load the posting", { description: String((e as Error).message) });
        setDetails((all) => ({ ...all, [id]: { id, pageStatus: page_status, pageError: String((e as Error).message), description: null, visaSentence: null } }));
      },
    );
    return () => {
      live = false;
    };
  }, [selected, details]);

  const select = (id: string) => {
    setSelectedId(id);
    setShowDetailOnMobile(true);
  };

  const move = useCallback(
    (step: number) => {
      const i = shown.findIndex((j) => j.id === selected?.id);
      const next = shown[Math.min(shown.length - 1, Math.max(0, i + step))];
      if (next) setSelectedId(next.id);
    },
    [shown, selected],
  );

  const toggleMark = useCallback(
    async (job: Job, mark: Mark) => {
      const next = job.mark === mark ? null : mark;
      if (!FILTERS[filter].keep({ ...job, mark: next })) {
        const i = shown.findIndex((j) => j.id === job.id);
        const neighbor = shown[i + 1] ?? shown[i - 1];
        if (neighbor) setSelectedId(neighbor.id);
      }
      setJobs((all) => all.map((j) => (j.id === job.id ? { ...j, mark: next } : j)));
      try {
        await api.mark(job.id, next);
      } catch (e) {
        setJobs((all) => all.map((j) => (j.id === job.id ? { ...j, mark: job.mark } : j)));
        toast.error("Could not update the job", { description: String((e as Error).message) });
      }
    },
    [filter, shown],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || !selected) return;
      const actions: Record<string, () => void> = {
        j: () => move(1),
        k: () => move(-1),
        s: () => void toggleMark(selected, "saved"),
        h: () => void toggleMark(selected, "hidden"),
        o: () => window.open(selected.url, "_blank", "noopener"),
      };
      actions[e.key]?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, move, toggleMark, settingsOpen]);

  async function runPipeline() {
    if (running) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setRunning(true);
    let crawled = 0;
    let scored = 0;
    let lastTiming = "";
    try {
      while (!stopRef.current) {
        const r = await api.process();
        crawled += r.crawled;
        scored += r.evaluated;
        const t = r.timing;
        if (r.crawled + r.evaluated > 0) lastTiming = `Last batch ${secs(t.batchMs)}: page fetch avg ${secs(t.crawl.avgMs)} (max ${secs(t.crawl.maxMs)}), model call avg ${secs(t.evaluate.avgMs)} (max ${secs(t.evaluate.maxMs)}).`;
        await refresh();
        if (r.errors.length) toast.warning(`${r.errors.length} ${r.errors.length === 1 ? "job" : "jobs"} failed to score`, { description: r.errors[0] });
        if (r.crawled + r.evaluated === 0) break;
      }
      toast.success(`Crawled ${crawled}, scored ${scored}`, {
        description: `${stopRef.current ? "Stopped." : "Everything in scope is done."} ${lastTiming}`,
      });
    } catch (e) {
      toast.error("Batch failed", { description: String((e as Error).message) });
    } finally {
      setRunning(false);
    }
  }

  const c = state?.counts;

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BriefcaseBusinessIcon className="size-4" />
        </div>
        <h1 className="font-heading text-base font-semibold">JobFinder</h1>
        <div className="ml-auto flex items-center gap-3">
          {c && (
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="tabular-nums">
                {c.evaluated} of {c.in_scope} scored
              </span>
              <Progress value={c.in_scope ? Math.round((c.evaluated / c.in_scope) * 100) : 0} className="h-1.5 w-24" />
            </div>
          )}
          <Button size="sm" variant={running ? "secondary" : "default"} onClick={runPipeline} disabled={!state?.profile.hasResume}>
            {running ? <SquareIcon /> : <PlayIcon />} {running ? "Stop" : "Crawl + score"}
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Settings" onClick={() => setSettingsOpen(true)} className="relative">
            <SettingsIcon />
            {state && !state.profile.hasResume && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-red-500" />}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[400px_minmax(0,1fr)]">
        <aside className={cn("min-h-0 border-r bg-background", showDetailOnMobile && selected ? "hidden md:flex md:flex-col" : "flex flex-col")}>
          <JobList
            jobs={shown}
            allJobs={jobs}
            loading={jobsLoading}
            selectedId={selected?.id ?? null}
            onSelect={select}
            filter={filter}
            onFilter={setFilter}
            query={query}
            onQuery={setQuery}
          />
        </aside>
        <main className={cn("min-h-0 overflow-y-auto bg-muted/40", showDetailOnMobile && selected ? "block" : "hidden md:block")}>
          {selected ? (
            <JobDetail
              key={selected.id}
              job={selected}
              detail={details[selected.id] ?? null}
              onMark={(m) => void toggleMark(selected, m)}
              onBack={() => setShowDetailOnMobile(false)}
            />
          ) : (
            <p className="p-12 text-center text-sm text-muted-foreground">{jobsLoading ? "" : "Pick a job to see the details."}</p>
          )}
        </main>
      </div>

      {state && <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} state={state} onChange={refresh} />}
    </div>
  );
}
