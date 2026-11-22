import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluate, visaSentence } from "../src/evaluate.ts";
import { json, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

const llm = { baseUrl: "https://llm.test/v1", model: "test/model", apiKey: "secret" };
const job = { company: "Acme", title: "New Grad SWE", locations: ["New York, NY"], description: "Build things." };
const answers = { answers: { fit: { score: 3 }, sponsorship: { choice: "offers" }, new_grad: { noul: 0.8 } } };

describe("evaluate", () => {
  it("sends the resume and job to the decisions endpoint and returns the answers", async () => {
    const f = stubFetch({ "https://llm.test/v1/decisions": () => json(answers) });
    expect(await evaluate(llm, "my resume", job)).toEqual({ fit: 3, sponsorship: "offers", new_grad_p: 0.8, model: "test/model" });
    const req = f.calls[0];
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe("Bearer secret");
    const body = await req.json();
    expect(body.model).toBe("test/model");
    expect(body.state).toEqual({ candidate_resume: "my resume", job });
    expect(Object.keys(body.questions)).toEqual(["fit", "sponsorship", "new_grad"]);
  });

  it("truncates the resume to 15000 characters", async () => {
    const f = stubFetch({ "https://llm.test/v1/decisions": () => json(answers) });
    await evaluate(llm, "r".repeat(20_000), job);
    expect((await f.calls[0].json()).state.candidate_resume).toHaveLength(15_000);
  });

  it("tells the model to judge from the title when there is no description", async () => {
    const f = stubFetch({ "https://llm.test/v1/decisions": () => json(answers) });
    await evaluate(llm, "resume", { ...job, description: null });
    expect((await f.calls[0].json()).state.job.description).toMatch(/title only/);
  });

  it("throws with the status and a truncated body on an HTTP error", async () => {
    stubFetch({ "https://llm.test/v1/decisions": () => new Response("x".repeat(1000), { status: 500 }) });
    const err = await evaluate(llm, "resume", job).catch((e: Error) => e);
    expect((err as Error).message).toBe(`test/model HTTP 500: ${"x".repeat(300)}`);
  });

  it.each([
    ["no answers", {}],
    ["a score that is not a number", { answers: { ...answers.answers, fit: { score: "3" } } }],
    ["an unknown sponsorship choice", { answers: { ...answers.answers, sponsorship: { choice: "maybe" } } }],
    ["a sponsorship choice that is not a string", { answers: { ...answers.answers, sponsorship: { choice: 1 } } }],
    ["a missing probability", { answers: { ...answers.answers, new_grad: {} } }],
  ])("rejects %s", async (_name, payload) => {
    stubFetch({ "https://llm.test/v1/decisions": () => json(payload) });
    await expect(evaluate(llm, "resume", job)).rejects.toThrow(/unexpected test\/model response/);
  });
});

describe("visaSentence", () => {
  it("quotes the first sentence about work authorization", () => {
    expect(visaSentence("We build maps. However, CoStar is not able to provide visa sponsorship for this position. Apply now.")).toBe(
      "However, CoStar is not able to provide visa sponsorship for this position.",
    );
    expect(visaSentence("Minimum Clearance Required to Start: Secret\nBenefits")).toBe("Minimum Clearance Required to Start: Secret");
    expect(visaSentence("Our customers include Anthropic, Google, and Visa. We cannot sponsor H-1B visas.")).toBe("We cannot sponsor H-1B visas.");
  });

  it("returns null when the posting does not mention visas", () => {
    expect(visaSentence("We build maps with Python.")).toBeNull();
  });

  it("limits the quote to 400 characters", () => {
    expect(visaSentence(`We sponsor ${"x".repeat(600)}`)).toHaveLength(400);
  });
});
