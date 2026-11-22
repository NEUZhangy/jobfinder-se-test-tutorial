export const LISTINGS_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json";

// D1 allows 100 bound parameters per query, so each chunk goes in as one JSON parameter.
const CHUNK_ROWS = 2000;

export type Listing = {
  id: string;
  company_name: string;
  title: string;
  category: string;
  url: string;
  locations: string[];
  active: boolean;
  is_visible: boolean;
  date_posted: number;
  date_updated: number;
};

type JobJson = {
  id: string;
  company: string;
  title: string;
  category: string;
  url: string;
  locations: string[];
  active: 0 | 1;
  date_posted: number;
  date_updated: number;
};

export function toJob(l: Listing): JobJson {
  const safe = /^https?:\/\//.test(l.url);
  return {
    id: l.id,
    company: l.company_name,
    title: l.title,
    category: l.category,
    url: l.url,
    locations: l.locations,
    active: l.active && l.is_visible && safe ? 1 : 0,
    date_posted: l.date_posted,
    date_updated: l.date_updated,
  };
}

// A closed listing is only stored when the job is already known, so its status can change to inactive.
// Upstream opens and closes jobs without a newer date_updated, so a status change always applies.
const UPSERT_CHUNK = `
INSERT INTO jobs (id, company, title, category, url, locations, active, date_posted, date_updated)
SELECT json_extract(value, '$.id'), json_extract(value, '$.company'), json_extract(value, '$.title'),
       json_extract(value, '$.category'), json_extract(value, '$.url'), json_extract(value, '$.locations'),
       json_extract(value, '$.active'), json_extract(value, '$.date_posted'), json_extract(value, '$.date_updated')
FROM json_each(?1)
WHERE json_extract(value, '$.active') = 1
   OR EXISTS (SELECT 1 FROM jobs k WHERE k.id = json_extract(value, '$.id'))
ON CONFLICT (id) DO UPDATE SET
  company = excluded.company, title = excluded.title, category = excluded.category,
  url = excluded.url, locations = excluded.locations, active = excluded.active,
  date_posted = excluded.date_posted, date_updated = excluded.date_updated
WHERE excluded.date_updated > jobs.date_updated OR excluded.active <> jobs.active`;

// listings.json is a pretty-printed array: each listing starts at "{" and ends with "\n    }".
export async function* listingsFrom(body: ReadableStream<Uint8Array>): AsyncGenerator<Listing> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    for (let end = buffer.indexOf("\n    }"); end !== -1; end = buffer.indexOf("\n    }")) {
      yield JSON.parse(buffer.slice(buffer.indexOf("{"), end + "\n    }".length));
      buffer = buffer.slice(end + "\n    }".length);
    }
  }
}

export async function syncAll(db: D1Database): Promise<{ changed: boolean; seen: number; written: number }> {
  const last = await db.prepare("SELECT etag FROM sync_state WHERE id = 1").first<string>("etag");
  const res = await fetch(LISTINGS_URL, { headers: last ? { "If-None-Match": last } : {} });
  if (res.status === 304) return { changed: false, seen: 0, written: 0 };
  if (!res.ok || !res.body) throw new Error(`listings fetch failed: ${res.status}`);

  const upsert = db.prepare(UPSERT_CHUNK);
  let chunk: JobJson[] = [];
  let seen = 0;
  let written = 0;
  const flush = async () => {
    if (chunk.length === 0) return;
    written += (await upsert.bind(JSON.stringify(chunk)).run()).meta.changes;
    chunk = [];
  };
  for await (const listing of listingsFrom(res.body)) {
    seen++;
    chunk.push(toJob(listing));
    if (chunk.length === CHUNK_ROWS) await flush();
  }
  await flush();
  if (seen === 0) throw new Error("listings.json had no listings");
  await db.prepare("UPDATE sync_state SET etag = ?, at = ? WHERE id = 1").bind(res.headers.get("etag"), Date.now()).run();
  return { changed: true, seen, written };
}
