const MAX_RESUME = 15_000;

const SPONSORSHIP = {
  offers: "The posting says the company sponsors work visas such as H-1B, or welcomes candidates who need sponsorship",
  no_sponsorship: "The posting says the company will not sponsor visas, or candidates must already be authorized to work without sponsorship",
  citizenship_required: "The posting requires U.S. citizenship, permanent residency, or a security clearance",
  not_mentioned: "The posting does not address visa sponsorship or work authorization",
} as const;
export type Sponsorship = keyof typeof SPONSORSHIP;

const VISA_WORDS =
  /sponsor|citizen|security clearance|clearance required|authori[sz]ed to work|work authori[sz]ation|\bh-?1b\b|work visa|visa (?:status|support|requirement)/i;

// The sentence a reader needs to check the sponsorship label, quoted from the posting.
export function visaSentence(description: string): string | null {
  const sentence = description
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .find((s) => VISA_WORDS.test(s));
  return sentence ? sentence.slice(0, 400) : null;
}

// Jev answers typed questions about one state: score (0..n-1), choice (one key), noul (probability of true).
const QUESTIONS = {
  fit: {
    type: "score",
    instructions:
      "How well does `candidate_resume` match `job`? Judge the skills, technologies, education, and experience level the job asks for.",
    criteria: [
      "Poor: most core requirements are missing from the resume",
      "Partial: some requirements match, important ones are missing",
      "Good: most requirements match",
      "Strong: nearly all requirements match and the experience level fits",
    ],
  },
  sponsorship: {
    type: "choice",
    instructions: "What does `job.description` say about visa sponsorship or work authorization?",
    criteria: SPONSORSHIP,
  },
  new_grad: {
    type: "noul",
    instructions: "Is `job` open to new graduates with less than one year of full-time work experience?",
    criteria: {
      true: "Entry-level, new grad, or early-career role",
      false: "Asks for two or more years of professional experience, or is a senior role",
    },
  },
};

type JobForEvaluation = { company: string; title: string; locations: string[]; description: string | null };
type Evaluation = { fit: number; sponsorship: Sponsorship; new_grad_p: number; model: string };
type LlmConfig = { baseUrl: string; model: string; apiKey: string };
type Decisions = { answers?: { fit?: { score?: unknown }; sponsorship?: { choice?: unknown }; new_grad?: { noul?: unknown } } };

const isSponsorship = (v: unknown): v is Sponsorship => typeof v === "string" && v in SPONSORSHIP;

// Jev on Infron is served by the decisions endpoint, not chat completions.
export async function evaluate(llm: LlmConfig, resume: string, job: JobForEvaluation): Promise<Evaluation> {
  const state = {
    candidate_resume: resume.slice(0, MAX_RESUME),
    job: { ...job, description: job.description ?? "Description unavailable; judge from the title only." },
  };
  const res = await fetch(`${llm.baseUrl}/decisions`, {
    method: "POST",
    headers: { authorization: `Bearer ${llm.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: llm.model, state, questions: QUESTIONS }),
  });
  if (!res.ok) throw new Error(`${llm.model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const raw = (await res.json()) as Decisions;
  const a = raw.answers;
  const fit = a?.fit?.score;
  const sponsorship = a?.sponsorship?.choice;
  const newGrad = a?.new_grad?.noul;
  if (typeof fit !== "number" || !isSponsorship(sponsorship) || typeof newGrad !== "number") {
    throw new Error(`unexpected ${llm.model} response: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  return { fit, sponsorship, new_grad_p: newGrad, model: llm.model };
}
