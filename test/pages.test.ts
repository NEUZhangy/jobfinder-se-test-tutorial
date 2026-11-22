import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJobPage, htmlToText } from "../src/pages.ts";
import { LONG_DESC, LONG_HTML, json, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

const html = (body: string, init?: ResponseInit) => new Response(body, { headers: { "content-type": "text/html" }, ...init });

describe("htmlToText", () => {
  it("keeps visible text and drops scripts", () => {
    expect(htmlToText("<div><h2>About</h2><script>var x=1</script><p>We sponsor&nbsp;H-1B &amp; OPT.</p></div>")).toBe(
      "About\nWe sponsor H-1B & OPT.",
    );
  });

  it("strips tags that were escaped twice", () => {
    expect(htmlToText("<p>Engineer &lt;br&gt;Job Description</p>")).toBe("Engineer\nJob Description");
  });

  it("decodes numeric entities", () => {
    expect(htmlToText("San Francisco &#x2B; 1 other &#8212; it&#39;s remote")).toBe("San Francisco + 1 other — it's remote");
  });

  it("keeps generics and survives out-of-range entities", () => {
    expect(htmlToText("<p>Use List&lt;String&gt; and Optional&lt;T&gt;</p>")).toBe("Use List<String> and Optional<T>");
    expect(htmlToText("a &#99999999; b")).toBe("a &#99999999; b");
    expect(htmlToText("a &#0; b &quot;q&quot;")).toBe('a &#0; b "q"');
  });
});

describe("generic HTML pages", () => {
  const url = "https://careers.example.com/jobs/1";

  it("returns the page text and identifies itself with a user agent", async () => {
    const f = stubFetch({ [url]: () => html(LONG_HTML) });
    const page = await fetchJobPage(url);
    expect(page).toEqual({ status: "ok", description: htmlToText(LONG_HTML) });
    expect(f.calls[0].headers.get("user-agent")).toContain("jobfinder");
  });

  it("caps the description at 20000 characters", async () => {
    stubFetch({ [url]: () => html(`<p>${"a".repeat(30_000)}</p>`) });
    const page = await fetchJobPage(url);
    expect(page.status === "ok" && page.description.length).toBe(20_000);
  });

  it.each([404, 410])("treats HTTP %i as a closed job", async (status) => {
    stubFetch({ [url]: () => html("gone", { status }) });
    expect(await fetchJobPage(url)).toEqual({ status: "closed" });
  });

  it("treats HTTP 500 as a failure, not a closed job", async () => {
    stubFetch({ [url]: () => html("oops", { status: 500 }) });
    expect(await fetchJobPage(url)).toEqual({ status: "failed", error: "HTTP 500" });
  });

  it("fails when the page text is too short to be a posting", async () => {
    stubFetch({ [url]: () => html("<p>Loading...</p>") });
    const page = await fetchJobPage(url);
    expect(page).toMatchObject({ status: "failed", error: expect.stringContaining("no description") });
  });

  it("reports a network error as a failure", async () => {
    stubFetch({
      [url]: () => {
        throw new TypeError("connection reset");
      },
    });
    expect(await fetchJobPage(url)).toEqual({ status: "failed", error: "TypeError: connection reset" });
  });

  it("reports an invalid URL as a failure", async () => {
    const page = await fetchJobPage("not a url");
    expect(page).toMatchObject({ status: "failed", error: expect.stringContaining("Invalid URL") });
  });

  it("stops reading a huge body at 3 MB", async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new TextEncoder().encode("<p>" + "x".repeat(999_990) + "</p>");
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls++;
        c.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    stubFetch({ [url]: () => new Response(body) });
    const page = await fetchJobPage(url);
    expect(page.status).toBe("ok");
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(5);
  });
});

describe("Workday adapter", () => {
  const api = "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/job/NYC/Software-Engineer_R1";

  it("calls the CXS API for a URL without a locale", async () => {
    const f = stubFetch({ [api]: () => json({ jobPostingInfo: { jobDescription: LONG_HTML } }) });
    const page = await fetchJobPage("https://acme.wd5.myworkdayjobs.com/External/job/NYC/Software-Engineer_R1");
    expect(page).toEqual({ status: "ok", description: htmlToText(LONG_HTML) });
    expect(f.calls[0].method).toBe("GET");
    expect(f.calls[0].headers.get("accept")).toBe("application/json");
  });

  it("skips a locale prefix", async () => {
    stubFetch({ [api]: () => json({ jobPostingInfo: { jobDescription: LONG_HTML } }) });
    const page = await fetchJobPage("https://acme.wd5.myworkdayjobs.com/en-US/External/job/NYC/Software-Engineer_R1");
    expect(page.status).toBe("ok");
  });

  it.each(["https://acme.wd5.myworkdayjobs.com/", "https://acme.wd5.myworkdayjobs.com/External", "https://acme.wd5.myworkdayjobs.com/en-US/External"])(
    "rejects the URL shape %s without calling the API",
    async (url) => {
      const f = stubFetch();
      expect(await fetchJobPage(url)).toMatchObject({ status: "failed", error: expect.stringContaining("unexpected URL shape") });
      expect(f.calls).toHaveLength(0);
    },
  );

  it("does not treat an API 404 as a closed job", async () => {
    stubFetch({ [api]: () => new Response("nope", { status: 404 }) });
    expect(await fetchJobPage("https://acme.wd5.myworkdayjobs.com/External/job/NYC/Software-Engineer_R1")).toEqual({
      status: "failed",
      error: "HTTP 404",
    });
  });

  it("fails when the response has no description", async () => {
    stubFetch({ [api]: () => json({}) });
    const page = await fetchJobPage("https://acme.wd5.myworkdayjobs.com/External/job/NYC/Software-Engineer_R1");
    expect(page).toMatchObject({ status: "failed", error: expect.stringContaining("no description") });
  });
});

describe("Ashby adapter", () => {
  const graphql = "https://jobs.ashbyhq.com/api/non-user-graphql";
  const url = "https://jobs.ashbyhq.com/acme/0b5e0c1e-aaaa-bbbb-cccc-123456789abc";

  it("posts a GraphQL query for the org and posting id", async () => {
    const f = stubFetch({ [graphql]: () => json({ data: { jobPosting: { descriptionHtml: LONG_HTML } } }) });
    expect(await fetchJobPage(url)).toEqual({ status: "ok", description: htmlToText(LONG_HTML) });
    const sent = await f.calls[0].json();
    expect(f.calls[0].method).toBe("POST");
    expect(sent.variables).toEqual({ org: "acme", id: "0b5e0c1e-aaaa-bbbb-cccc-123456789abc" });
  });

  it("treats a missing posting as closed", async () => {
    stubFetch({ [graphql]: () => json({ data: { jobPosting: null } }) });
    expect(await fetchJobPage(url)).toEqual({ status: "closed" });
  });

  it("treats a response without data as closed", async () => {
    stubFetch({ [graphql]: () => json({ errors: [] }) });
    expect(await fetchJobPage(url)).toEqual({ status: "closed" });
  });

  it("fails on an HTTP error", async () => {
    stubFetch({ [graphql]: () => new Response("", { status: 503 }) });
    expect(await fetchJobPage(url)).toEqual({ status: "failed", error: "HTTP 503" });
  });

  it("rejects a URL with no posting id", async () => {
    stubFetch();
    expect(await fetchJobPage("https://jobs.ashbyhq.com/acme")).toMatchObject({ status: "failed", error: expect.stringContaining("unexpected URL shape") });
  });
});

describe("Workable adapter", () => {
  const api = "https://apply.workable.com/api/v2/accounts/acme/jobs/ABC123";

  it("joins description, requirements and benefits", async () => {
    stubFetch({ [api]: () => json({ description: `<p>${LONG_DESC}</p>`, requirements: "<p>Must know Go.</p>", benefits: "<p>Snacks.</p>" }) });
    const page = await fetchJobPage("https://apply.workable.com/acme/j/ABC123/");
    expect(page.status).toBe("ok");
    const text = page.status === "ok" ? page.description : "";
    expect(text).toContain("Must know Go.");
    expect(text).toContain("Snacks.");
  });

  it("fails on an HTTP error", async () => {
    stubFetch({ [api]: () => new Response("", { status: 500 }) });
    expect(await fetchJobPage("https://apply.workable.com/acme/j/ABC123/")).toEqual({ status: "failed", error: "HTTP 500" });
  });

  it("rejects a URL with no shortcode", async () => {
    stubFetch();
    expect(await fetchJobPage("https://apply.workable.com/acme")).toMatchObject({ status: "failed", error: expect.stringContaining("unexpected URL shape") });
  });
});
