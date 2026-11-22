import type { Sponsorship } from "@/api";

const FIT_TIERS = [
  { min: 3, label: "Strong fit", pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
  { min: 2, label: "Good fit", pill: "bg-amber-500/15 text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
  { min: 0, label: "Weak fit", pill: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/40" },
] as const;

export const fitTier = (fit: number) => FIT_TIERS.find((t) => fit >= t.min)!;
export const fitPct = (fit: number) => Math.round((fit / 3) * 100);

export const VISA: Record<Sponsorship, { label: string; className: string }> = {
  offers: { label: "Sponsors", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  no_sponsorship: { label: "No sponsorship", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" },
  citizenship_required: { label: "Citizens only", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" },
  not_mentioned: { label: "Not mentioned", className: "text-muted-foreground" },
};

export const daysAgo = (unix: number) => {
  const d = Math.floor((Date.now() / 1000 - unix) / 86400);
  return d <= 0 ? "today" : `${d}d ago`;
};
