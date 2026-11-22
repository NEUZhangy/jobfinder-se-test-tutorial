import { DatabaseIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type AppState } from "@/api";
import { ResumeCard } from "@/components/resume-card";
import { ScopeCard } from "@/components/scope-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; state: AppState; onChange: () => Promise<void> };

export function SettingsSheet({ open, onOpenChange, state, onChange }: Props) {
  const [syncing, setSyncing] = useState(false);
  const c = state.counts;

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.sync();
      toast.success(r.changed ? `Synced ${r.seen} recent listings` : "Already up to date");
      await onChange();
    } catch (e) {
      toast.error("Sync failed", { description: String((e as Error).message) });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Your resume and the jobs worth scoring.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <ResumeCard profile={state.profile} onSaved={onChange} />
          <ScopeCard key={state.profile.categories.join() + state.profile.locationKeywords.join()} state={state} onSaved={onChange} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DatabaseIcon className="size-4 text-muted-foreground" /> Data
              </CardTitle>
              <CardDescription>
                {state.lastSync ? `Last synced ${new Date(state.lastSync).toLocaleString()}` : "Not synced yet"}. Every 6 hours a cron job syncs all listings, then crawls and scores until no job is left.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {[["Active listings", c.active], ["In scope", c.in_scope], ["Crawled", c.crawled], ["Scored", c.evaluated]].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums">{v.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              <Button variant="outline" onClick={sync} disabled={syncing}>
                <RefreshCwIcon className={syncing ? "animate-spin" : ""} /> Sync all listings
              </Button>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
