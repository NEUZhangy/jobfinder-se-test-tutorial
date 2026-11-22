import { ArrowLeftIcon, BookmarkIcon, EyeOffIcon, ExternalLinkIcon } from "lucide-react";
import type { Job, JobDetail as Detail } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { VISA, daysAgo, fitPct, fitTier } from "@/lib/fit";
import { cn } from "@/lib/utils";

const VISA_WORDS = /(sponsor\w*|citizen\w*|clearance|authori[sz]\w*|h-?1b|work visa)/gi;

function Highlighted({ text }: { text: string }) {
  return text.split(VISA_WORDS).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-sm bg-amber-200 px-0.5 text-foreground dark:bg-amber-500/30">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

type Props = {
  job: Job;
  detail: Detail | null;
  onMark: (mark: "saved" | "hidden") => void;
  onBack: () => void;
};

export function JobDetail({ job, detail, onMark, onBack }: Props) {
  const tier = job.fit == null ? null : fitTier(job.fit);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="-ml-2 self-start md:hidden" onClick={onBack}>
        <ArrowLeftIcon /> All jobs
      </Button>

      <header className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {job.company} · {job.category} · posted {daysAgo(job.date_posted)}
        </p>
        <h2 className="font-heading text-xl leading-snug font-semibold">{job.title}</h2>
        <p className="text-sm text-muted-foreground">{job.locations.join("; ")}</p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Fit">
          {job.fit == null ? (
            <span className="text-sm text-muted-foreground">{job.eval_error ? "Scoring failed" : "Not scored"}</span>
          ) : (
            <>
              <span className="text-2xl font-semibold tabular-nums">{fitPct(job.fit)}</span>
              <span className="text-xs text-muted-foreground">{tier!.label}</span>
            </>
          )}
        </Tile>
        <Tile label="Visa">
          {job.sponsorship ? (
            <Badge variant="outline" className={cn("h-auto whitespace-normal", VISA[job.sponsorship].className)}>
              {VISA[job.sponsorship].label}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">Not scored</span>
          )}
        </Tile>
        <Tile label="New grad">
          <span className="text-2xl font-semibold tabular-nums">
            {job.new_grad_p == null ? "–" : `${Math.round(job.new_grad_p * 100)}%`}
          </span>
        </Tile>
      </div>
      {job.eval_error && <p className="text-xs break-words text-destructive">{job.eval_error}</p>}

      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What the posting says about visas</h3>
        {detail == null ? (
          <Skeleton className="mt-2 h-5 w-3/4" />
        ) : detail.visaSentence ? (
          <blockquote className="mt-2 border-l-2 pl-3 text-sm leading-relaxed">
            <Highlighted text={detail.visaSentence} />
          </blockquote>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.description ? "Nothing about sponsorship or work authorization in the posting." : "The posting has not been crawled yet."}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon /> Open posting
          </a>
        </Button>
        <Button variant={job.mark === "saved" ? "secondary" : "outline"} onClick={() => onMark("saved")}>
          <BookmarkIcon className={cn(job.mark === "saved" && "fill-current")} /> {job.mark === "saved" ? "Saved" : "Save"}
        </Button>
        <Button variant={job.mark === "hidden" ? "secondary" : "outline"} onClick={() => onMark("hidden")}>
          <EyeOffIcon /> {job.mark === "hidden" ? "Hidden" : "Hide"}
        </Button>
        <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground lg:flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> move <Kbd>S</Kbd> save <Kbd>H</Kbd> hide <Kbd>O</Kbd> open
        </span>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Posting</h3>
        {detail == null ? (
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : detail.description ? (
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/90">{detail.description}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.pageError ?? "No description stored."} Open the posting to read it on the company site.
          </p>
        )}
      </section>
    </article>
  );
}
