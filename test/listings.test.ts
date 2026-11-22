import { describe, expect, it } from "vitest";
import { LISTINGS_URL, listingsFrom, syncAll, toJob, type Listing } from "../src/listings.ts";
import { NOW, addJob, freezeTime, stubFetch, useDb } from "./helpers";

const listing = (id: string, over: Partial<Listing> = {}): Listing => ({
  id,
  company_name: "Acme's",
  title: "Software Engineer, New Grad",
  category: "Software",
  url: `https://jobs.lever.co/acme/${id}`,
  locations: ["New York, NY"],
  active: true,
  is_visible: true,
  date_posted: 1790000000,
  date_updated: 1790000100,
  ...over,
});

const file = (items: Listing[]) => JSON.stringify(items, null, 4);
const serve = (items: Listing[], headers: Record<string, string> = {}) => () => new Response(file(items), { headers });

describe("toJob", () => {
  it("stores closed, hidden, or non-http listings as inactive", () => {
    expect(toJob(listing("x", { active: false }))).toEqual({
      id: "x", company: "Acme's", title: "Software Engineer, New Grad", category: "Software",
      url: "https://jobs.lever.co/acme/x", locations: ["New York, NY"], active: 0,
      date_posted: 1790000000, date_updated: 1790000100,
    });
    expect(toJob(listing("y", { is_visible: false })).active).toBe(0);
    expect(toJob(listing("z", { url: "javascript:alert(1)" })).active).toBe(0);
    expect(toJob(listing("w")).active).toBe(1);
  });
});

describe("listingsFrom", () => {
  it("parses every listing even when chunks split them", async () => {
    const bytes = new TextEncoder().encode(file([listing("a"), listing("b"), listing("c", { active: false })]));
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37));
        c.close();
      },
    });
    const ids: string[] = [];
    for await (const l of listingsFrom(body)) ids.push(l.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("syncAll", () => {
  const db = useDb();
  const jobs = () => db().prepare("SELECT id, title, active, date_updated FROM jobs ORDER BY id").all<{ id: string; title: string; active: number; date_updated: number }>().then((r) => r.results);

  it("stores the listings and saves the ETag and time", async () => {
    freezeTime();
    const f = stubFetch({ [LISTINGS_URL]: serve([listing("a"), listing("b")], { etag: 'W/"v1"' }) });
    expect(await syncAll(db())).toEqual({ changed: true, seen: 2, written: 2 });
    expect((await jobs()).map((j) => j.id)).toEqual(["a", "b"]);
    expect(f.calls[0].headers.get("if-none-match")).toBeNull();
    const state = await db().prepare("SELECT etag, at FROM sync_state WHERE id = 1").first();
    expect(state).toEqual({ etag: 'W/"v1"', at: NOW });
  });

  it("sends the saved ETag and does nothing on 304", async () => {
    stubFetch({ [LISTINGS_URL]: serve([listing("a")], { etag: '"v1"' }) });
    await syncAll(db());
    const f = stubFetch({ [LISTINGS_URL]: () => new Response(null, { status: 304 }) });
    expect(await syncAll(db())).toEqual({ changed: false, seen: 0, written: 0 });
    expect(f.calls[0].headers.get("if-none-match")).toBe('"v1"');
    expect(await jobs()).toHaveLength(1);
  });

  it("throws when the download fails and keeps the old ETag", async () => {
    stubFetch({ [LISTINGS_URL]: () => new Response("down", { status: 503 }) });
    await expect(syncAll(db())).rejects.toThrow("listings fetch failed: 503");
    expect(await db().prepare("SELECT etag FROM sync_state WHERE id = 1").first("etag")).toBeNull();
  });

  it("throws on an empty file without saving the ETag", async () => {
    stubFetch({ [LISTINGS_URL]: serve([], { etag: '"empty"' }) });
    await expect(syncAll(db())).rejects.toThrow("listings.json had no listings");
    expect(await db().prepare("SELECT etag FROM sync_state WHERE id = 1").first("etag")).toBeNull();
  });

  it("writes more than 2000 listings in several chunks", async () => {
    const many = Array.from({ length: 4500 }, (_, i) => listing(`id-${String(i).padStart(5, "0")}`));
    stubFetch({ [LISTINGS_URL]: serve(many) });
    expect(await syncAll(db())).toEqual({ changed: true, seen: 4500, written: 4500 });
    expect(await jobs()).toHaveLength(4500);
  });

  it("stores a closed listing only when the job is already known", async () => {
    await addJob(db(), { id: "known" });
    stubFetch({ [LISTINGS_URL]: serve([listing("known", { active: false }), listing("stranger", { active: false })]) });
    await syncAll(db());
    expect(await jobs()).toEqual([expect.objectContaining({ id: "known", active: 0 })]);
  });

  it("applies a close even without a newer date_updated", async () => {
    await addJob(db(), { id: "a", date_updated: 1790000100 });
    stubFetch({ [LISTINGS_URL]: serve([listing("a", { active: false, date_updated: 1790000100 })]) });
    await syncAll(db());
    expect((await jobs())[0].active).toBe(0);
  });

  it("reopens a closed job when the listing has a newer date_updated", async () => {
    await addJob(db(), { id: "a", active: 0, date_updated: 1790000100 });
    stubFetch({ [LISTINGS_URL]: serve([listing("a", { date_updated: 1790000200 })]) });
    await syncAll(db());
    expect(await jobs()).toEqual([expect.objectContaining({ id: "a", active: 1, date_updated: 1790000200 })]);
  });

  // README says "A reopen needs a newer date_updated", but the SQL (`excluded.active <> jobs.active`) and
  // the comment above it say a status change always applies. This pins the current behavior.
  it("also reopens a closed job whose date_updated did not change", async () => {
    await addJob(db(), { id: "a", active: 0, date_updated: 1790000100 });
    stubFetch({ [LISTINGS_URL]: serve([listing("a", { date_updated: 1790000100 })]) });
    await syncAll(db());
    expect((await jobs())[0].active).toBe(1);
  });

  it("updates a changed listing only when it has a newer date_updated", async () => {
    await addJob(db(), { id: "a", title: "Old title", date_updated: 1790000100 });
    stubFetch({ [LISTINGS_URL]: serve([listing("a", { title: "Same age", date_updated: 1790000100 })]) });
    expect(await syncAll(db())).toMatchObject({ seen: 1, written: 0 });
    expect((await jobs())[0].title).toBe("Old title");

    stubFetch({ [LISTINGS_URL]: serve([listing("a", { title: "Newer", date_updated: 1790000300 })]) });
    expect(await syncAll(db())).toMatchObject({ written: 1 });
    expect((await jobs())[0].title).toBe("Newer");
  });

  it("stores a listing with a non-http URL as inactive only if known", async () => {
    stubFetch({ [LISTINGS_URL]: serve([listing("bad", { url: "javascript:alert(1)" })]) });
    await syncAll(db());
    expect(await jobs()).toEqual([]);
  });
});
