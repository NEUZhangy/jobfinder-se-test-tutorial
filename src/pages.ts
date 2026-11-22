type PageResult =
  | { status: "ok"; description: string }
  | { status: "closed" }
  | { status: "failed"; error: string };

type Adapter = { match: (u: URL) => boolean; fetch: (u: URL) => Promise<PageResult> };

const MAX_DESCRIPTION = 20_000;
const MAX_BODY = 3_000_000;
const HEADERS = { "user-agent": "jobfinder-demo (student project)", accept: "text/html,application/json" };

const ADAPTERS: Adapter[] = [
  {
    match: (u) => u.hostname.endsWith(".myworkdayjobs.com"),
    fetch: async (u) => {
      const parts = u.pathname.split("/").filter(Boolean);
      if (/^[a-z]{2}-[a-z]{2}$/i.test(parts[0])) parts.shift();
      const [site, ...rest] = parts;
      const tenant = u.hostname.split(".")[0];
      if (!site || rest.length === 0) return unparsed(u);
      const json = await getJson<{ jobPostingInfo?: { jobDescription?: string } }>(
        `https://${u.hostname}/wday/cxs/${tenant}/${site}/${rest.join("/")}`,
      );
      return "status" in json ? json : described(json.jobPostingInfo?.jobDescription);
    },
  },
  {
    match: (u) => u.hostname === "jobs.ashbyhq.com",
    fetch: async (u) => {
      const [org, id] = u.pathname.split("/").filter(Boolean);
      if (!org || !id) return unparsed(u);
      const json = await getJson<{ data?: { jobPosting: { descriptionHtml: string } | null } }>(
        "https://jobs.ashbyhq.com/api/non-user-graphql",
        {
          query:
            "query P($org: String!, $id: String!) { jobPosting(organizationHostedJobsPageName: $org, jobPostingId: $id) { descriptionHtml } }",
          variables: { org, id },
        },
      );
      if ("status" in json) return json;
      return json.data?.jobPosting ? described(json.data.jobPosting.descriptionHtml) : { status: "closed" };
    },
  },
  {
    match: (u) => u.hostname === "apply.workable.com",
    fetch: async (u) => {
      const [account, , shortcode] = u.pathname.split("/").filter(Boolean);
      if (!account || !shortcode) return unparsed(u);
      const json = await getJson<{ description?: string; requirements?: string; benefits?: string }>(
        `https://apply.workable.com/api/v2/accounts/${account}/jobs/${shortcode}`,
      );
      if ("status" in json) return json;
      return described([json.description, json.requirements, json.benefits].join("\n"));
    },
  },
  {
    match: () => true,
    fetch: async (u) => {
      const res = await fetch(u, { headers: HEADERS });
      if (res.status === 404 || res.status === 410) return { status: "closed" };
      const bad = badStatus(res);
      if (bad) return bad;
      return described(await readCapped(res));
    },
  },
];

export async function fetchJobPage(url: string): Promise<PageResult> {
  try {
    const u = new URL(url);
    return await ADAPTERS.find((a) => a.match(u))!.fetch(u);
  } catch (e) {
    return { status: "failed", error: String(e) };
  }
}

// API URLs are built by the adapters, so a 404 there means a bad guess, not a closed job.
async function getJson<T>(url: string, body?: unknown): Promise<T | PageResult> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { ...HEADERS, accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return badStatus(res) ?? (JSON.parse(await readCapped(res)) as T);
}

function badStatus(res: Response): PageResult | null {
  return res.ok ? null : { status: "failed", error: `HTTP ${res.status}` };
}

const unparsed = (u: URL): PageResult => ({ status: "failed", error: `unexpected URL shape: ${u.pathname}` });

function described(html: string | undefined): PageResult {
  const text = htmlToText(html ?? "");
  if (text.length < 300) return { status: "failed", error: "no description in page (likely rendered by JavaScript)" };
  return { status: "ok", description: text.slice(0, MAX_DESCRIPTION) };
}

// Some sites escape their HTML twice, so decoding entities can reveal tags that need a second pass.
export function htmlToText(html: string): string {
  const text = stripTags(html);
  return /<\/?(p|br|div|li|ul|ol|h\d|span|strong|em|b|i|a)\b[^>]*>/i.test(text) ? stripTags(text) : text;
}

function stripTags(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => codePoint(Number(n)) ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(parseInt(n, 16)) ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const codePoint = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : null);

async function readCapped(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (size >= MAX_BODY) {
      await reader.cancel();
      break;
    }
  }
  return out + decoder.decode();
}
