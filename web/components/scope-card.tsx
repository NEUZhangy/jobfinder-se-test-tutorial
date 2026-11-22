import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type AppState } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function ScopeCard({ state, onSaved }: { state: AppState; onSaved: () => void }) {
  const [categories, setCategories] = useState(state.profile.categories);
  const [locations, setLocations] = useState(state.profile.locationKeywords.join(", "));
  const [needsSponsorship, setNeedsSponsorship] = useState(state.profile.needsSponsorship);
  const [saving, setSaving] = useState(false);

  const toggle = (c: string, on: boolean) =>
    setCategories((cs) => (on ? [...cs, c] : cs.filter((x) => x !== c)));

  async function save() {
    setSaving(true);
    try {
      await api.saveSettings({
        categories,
        locationKeywords: locations.split(",").map((s) => s.trim()).filter(Boolean),
        needsSponsorship,
      });
      toast.success("Scope saved");
      onSaved();
    } catch (e) {
      toast.error("Could not save scope", { description: String((e as Error).message) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontalIcon className="size-4 text-muted-foreground" /> Scope
        </CardTitle>
        <CardDescription>Only jobs in scope are crawled and scored.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Categories</Label>
          {state.categories.map(({ category, n }) => (
            <Label key={category} className="flex items-center gap-2 font-normal">
              <Checkbox checked={categories.includes(category)} onCheckedChange={(v) => toggle(category, v === true)} />
              <span className="flex-1 truncate">{category}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
            </Label>
          ))}
        </div>
        <Separator />
        <div className="flex flex-col gap-2">
          <Label htmlFor="locations" className="text-xs text-muted-foreground uppercase tracking-wide">
            Locations
          </Label>
          <Input id="locations" placeholder="CA, NY, NYC, Remote" value={locations} onChange={(e) => setLocations(e.target.value)} />
          <p className="text-xs text-muted-foreground">Comma separated whole words, case-sensitive. Empty means anywhere.</p>
        </div>
        <Separator />
        <Label className="flex items-center justify-between gap-3 font-normal">
          <span>
            I need visa sponsorship
            <span className="block text-xs text-muted-foreground">Hide roles that rule it out</span>
          </span>
          <Switch checked={needsSponsorship} onCheckedChange={setNeedsSponsorship} />
        </Label>
      </CardContent>
      <CardFooter className="border-t pt-(--card-spacing)">
        <Button className="w-full" variant="secondary" onClick={save} disabled={saving || categories.length === 0}>
          {saving ? "Saving…" : "Save scope"}
        </Button>
      </CardFooter>
    </Card>
  );
}
