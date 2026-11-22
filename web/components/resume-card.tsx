import { FileTextIcon, FileUpIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Profile } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export function ResumeCard({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [mode, setMode] = useState("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = mode === "pdf" ? file != null : text.trim().length > 0;

  async function save() {
    const form = new FormData();
    if (mode === "pdf" && file) form.set("file", file);
    else form.set("text", text);
    setSaving(true);
    try {
      const r = await api.saveResume(form);
      toast.success("Resume saved", { description: `${r.chars.toLocaleString()} characters. Jobs in scope will be re-scored.` });
      setFile(null);
      setText("");
      onSaved();
    } catch (e) {
      toast.error("Could not save resume", { description: String((e as Error).message) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileTextIcon className="size-4 text-muted-foreground" /> Resume
        </CardTitle>
        <CardDescription>Every job is scored against this.</CardDescription>
        <CardAction>
          {profile.hasResume ? (
            <Badge variant="secondary">v{profile.resumeVersion}</Badge>
          ) : (
            <Badge variant="outline">None yet</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="w-full">
            <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
            <TabsTrigger value="text">Paste text</TabsTrigger>
          </TabsList>
          <TabsContent value="pdf" className="pt-2">
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center transition-colors hover:bg-muted/50">
              <FileUpIcon className="size-5 text-muted-foreground" />
              <span className="max-w-full truncate text-sm font-medium">{file ? file.name : "Choose a PDF"}</span>
              <span className="text-xs text-muted-foreground">{file ? `${Math.ceil(file.size / 1024)} KB` : "Text is extracted on Cloudflare"}</span>
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </TabsContent>
          <TabsContent value="text" className="pt-2">
            <Textarea
              className="h-32 resize-y"
              placeholder="Paste your resume as plain text"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </TabsContent>
        </Tabs>
        <Button onClick={save} disabled={!ready || saving}>
          <UploadIcon /> {saving ? "Saving…" : profile.hasResume ? "Replace resume" : "Save resume"}
        </Button>
      </CardContent>
    </Card>
  );
}
