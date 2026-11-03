import { NextResponse } from "next/server";
import { addFeedback, FEEDBACK_MAX, getSql } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";

/** The footer's "Написать нам": POST { text, product?, website } stores one anonymous message. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { text?: unknown; product?: unknown; website?: unknown };
  // The hidden field is filled only by bots: answer as if it worked.
  if (typeof b.website === "string" && b.website) return NextResponse.json({ code: "ok" });
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < 3 || text.length > FEEDBACK_MAX) return NextResponse.json({ code: "invalid" }, { status: 400 });
  if (!allow(`feedback:${clientIp(req)}`, 5, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const product = typeof b.product === "string" && /^\d{5,12}$/.test(b.product) ? b.product : null;
  const sql = getSql();
  if (!sql) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  await addFeedback(sql, "feedback", text, product);
  return NextResponse.json({ code: "ok" });
}
