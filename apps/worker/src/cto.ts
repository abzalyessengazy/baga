import Anthropic from "@anthropic-ai/sdk";

/**
 * The CTO note on top of the owner report (DECISIONS.md, 2026-11-12 "CTO note in the daily report"): Claude reads the
 * report's numbers, the GitHub runs and the day's commits and writes up to four short lines: what broke, what is
 * unusual, what to do and who does it. It only reads what it is given: no tools, no database, no pushes, deploys or
 * Kaspi requests. A note that cites a number not in its input is withheld (rule 2: never state a figure the data
 * does not hold). Without ANTHROPIC_API_KEY there is no note.
 */
export const CTO_MODEL = "claude-opus-5-5";

const SYSTEM = `You are the CTO of BAĞA, a small price-history site for Kaspi.kz run by one founder beside a full-time job.
Every day you get the owner report data as JSON: today's Kaspi collector run, the Technodom run, GitHub workflow failures of the last 24 hours, visitors and targets, alerts, savings, and the commits of the last 24 hours.
Write a note for the founder to read on a phone in ten seconds:
- At most 4 lines, each starting with "• ", each under 22 words, plain text, English. No headings, no greetings, no closing.
- First what broke or needs action, then what is unusual. For each, say what to do and who: "you" (the founder) or "Claude" (the coding agent).
- If nothing broke and nothing is unusual, write one line saying so and naming the one target furthest behind.
- Use only facts in the data. Every number you write must appear in the data exactly as given; never compute new numbers, percentages or totals, never estimate, never predict.
- Do not repeat the whole report; the founder sees it below your note.`;

/** Numbers in a text, separators removed: "1 166" → "1166", "25%" → "25", "0.9" → "0.9". */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d{1,3}(?:[   ,]\d{3})+(?!\d)|\d+(?:\.\d+)?/g)) {
    out.push(m[0].replace(/[   ,]/g, "").replace(/^0+(?=\d)/, ""));
  }
  return out;
}

/** The numbers of the note that its input does not hold; empty when every number is backed by the data. */
export function unbackedNumbers(note: string, input: string): string[] {
  const known = new Set(numbersIn(input));
  // Parts of decimals and dates in the input count too ("2026-11-12" → 2026, 11, 12; "0.25" → 0, 25).
  for (const m of input.matchAll(/\d+/g)) known.add(m[0].replace(/^0+(?=\d)/, ""));
  return [...new Set(numbersIn(note).filter((n) => !known.has(n)))];
}

export type CtoResult = { note: string } | { withheld: string } | null;

export async function ctoNote(data: unknown, apiKey: string | undefined): Promise<CtoResult> {
  if (!apiKey) return null;
  const input = JSON.stringify(data);
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  try {
    const r = await client.beta.messages.create({
      model: CTO_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [{ role: "user", content: input }],
    });
    if (r.stop_reason === "refusal") return { withheld: "the model declined" };
    const note = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (!note) return { withheld: "empty answer" };
    const bad = unbackedNumbers(note, input);
    if (bad.length) return { withheld: `it cited ${bad.slice(0, 3).join(", ")}, not in the data` };
    return { note };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { withheld: "ANTHROPIC_API_KEY was rejected" };
    if (e instanceof Anthropic.RateLimitError) return { withheld: "rate limited" };
    if (e instanceof Anthropic.APIError) return { withheld: `API error ${e.status ?? ""}`.trim() };
    return { withheld: "no connection to the API" };
  }
}
