import { formatTenge, PERSON_METRICS_FROM, share, targetMark, TARGETS, type TargetMark } from "@baga/core";
import type { OwnerReport } from "@baga/db";
import type { CtoResult } from "./cto";
import type { WorkflowFailure } from "./workflows";

/**
 * The daily owner report as one Telegram message (HTML). For the owner only, so it is in English like the rest of
 * the owner's tooling; every number comes from ownerReport (packages/db/src/report.ts). Short blocks the owner can
 * scan on a phone: what needs attention, the targets as an aligned table, savings, data, code. Details live on the
 * admin page.
 */
export interface Commit { hash: string; subject: string }

/** A finished collection day with fewer requests than this is reported as a problem (a full day is ~1,600). */
export const LOW_REQUESTS = 800;

const MARK: Record<TargetMark, string> = { on: "✅", half: "🟡", off: "🔴" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const pct = (r: number) => `${Math.round(r * 100)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
/** A source host without "www.", "l." or "m." and the top-level domain: l.instagram.com → instagram. */
const sourceName = (s: string) => s.replace(/^(www|l|m|lm)\./, "").replace(/\.(com|ru|kz|org|net)$/, "");

/** A commit subject's headline: up to the first ": " or " (", at most 60 characters. */
export function headline(subject: string): string {
  const cut = Math.min(...[subject.indexOf(": "), subject.indexOf(" (")].filter((i) => i >= 12), subject.length);
  const h = subject.slice(0, cut);
  return h.length > 60 ? `${h.slice(0, 59)}…` : h;
}

/** What needs the owner's attention; empty on a normal day. */
export function reportIssues(r: OwnerReport, now = new Date(), failures: WorkflowFailure[] = []): string[] {
  const out: string[] = [];
  for (const f of failures) if (!f.recovered) out.push(`GitHub: ${f.name} failed${f.failed > 1 ? ` ${f.failed}×` : ""}, no good run since`);
  const c = r.collector;
  if (c.runs === 0) out.push("Kaspi collector did not run today");
  else if (!c.running && c.requests < LOW_REQUESTS) out.push(`Kaspi collector sent only ${num(c.requests)} requests today`);
  // Stops behind a clean later run are history, shown under «Data today» (12 Nov: the morning stops stayed in «Needs you»).
  if (!c.lastOk) for (const a of c.aborted) out.push(`Kaspi run stopped: ${a}`);
  if (r.catalog.products > 0 && share(r.catalog.fresh3d, r.catalog.products) < 0.9) {
    out.push(`Only ${pct(share(r.catalog.fresh3d, r.catalog.products))} of products checked in the last 3 days`);
  }
  if (!r.store.startedAt) out.push("Technodom has never run");
  else if (now.getTime() - new Date(r.store.startedAt).getTime() > 36 * 3600_000) out.push("Technodom has not run for over 36 h");
  if (r.store.aborted) out.push(`Technodom run stopped: ${r.store.aborted}`);
  if (r.manual24h.blocked > 0) out.push(`Manual checks blocked by Kaspi (${r.manual24h.blocked})`);
  if (r.alerts.failed24h > 0) out.push(`${r.alerts.failed24h} notifications failed to send`);
  if (r.store.pendingMatches > 0) out.push(`Review ${r.store.pendingMatches} Technodom matches (admin)`);
  return out.map(esc);
}

/** One aligned row of the targets table: name, value, target, mark. */
function row(name: string, value: string, target: string, mark: TargetMark): string {
  return `${name.padEnd(11)}${value.padStart(5)}  🎯${target.padEnd(5)}${MARK[mark]}`;
}

/** The rates the report shows, rounded as shown: also handed to the CTO note so it never computes its own. */
export function reportRates(r: OwnerReport) {
  return {
    openItemPct: Math.round(share(r.funnel.productViews, r.funnel.tabs) * 100),
    connectedPct: Math.round(share(r.people.connected, r.people.watchers) * 100),
    fromPostsPct: Math.round(share(r.utmVisits, r.funnel.tabs) * 100),
    fresh3dPct: Math.round(share(r.catalog.fresh3d, r.catalog.products) * 100),
  };
}

export interface ReportExtras { failures?: WorkflowFailure[] | null; cto?: CtoResult }

export function renderOwnerReport(r: OwnerReport, commits: Commit[], now = new Date(), extras: ReportExtras = {}): string {
  const failures = extras.failures ?? [];
  const issues = reportIssues(r, now, failures);
  const f = r.funnel;
  const w = r.funnelWeek;
  const openRate = share(f.productViews, f.tabs);
  const connected = share(r.people.connected, r.people.watchers);
  const utm = share(r.utmVisits, f.tabs);
  // Visitors per day: people once the 7 days before have browser ids, visits (tabs) until then.
  const daily = r.weekPeopleReliable ? { label: "People/day", now: f.people, avg: w.people } : { label: "Visits/day", now: f.tabs, avg: w.tabs };
  const out: string[] = [];

  out.push(`<b>BAĞA · ${dayLabel(r.day)}</b>`);
  const cto = extras.cto;
  if (cto && "note" in cto) out.push(`🧠 <b>CTO</b>\n${esc(cto.note)}`, "");
  else if (cto) out.push(`<i>CTO note withheld: ${esc(cto.withheld)}.</i>`, "");
  out.push(issues.length === 0 ? "✅ All normal" : `⚠️ <b>Needs you</b>\n${issues.map((i) => `• ${i}`).join("\n")}`);

  out.push("", `<b>Yesterday</b> · targets for ${dayLabel(TARGETS.by)}`);
  out.push("<pre>" + [
    row(daily.label, num(daily.now), String(TARGETS.visitorsPerDay), targetMark(daily.avg, TARGETS.visitorsPerDay)),
    row("Open item", pct(openRate), pct(TARGETS.productOpenRate), targetMark(openRate, TARGETS.productOpenRate)),
    row("Alerts/wk", num(r.people.newTrackings7d), String(TARGETS.alertsPerWeek), targetMark(r.people.newTrackings7d, TARGETS.alertsPerWeek)),
    row("Connected", pct(connected), pct(TARGETS.connectedRate), targetMark(connected, TARGETS.connectedRate)),
    row("From posts", pct(utm), pct(TARGETS.utmShare), targetMark(utm, TARGETS.utmShare)),
    row("Bought", num(r.alerts.boughtYes), String(TARGETS.boughtYes), targetMark(r.alerts.boughtYes, TARGETS.boughtYes)),
  ].join("\n") + "</pre>");
  out.push(`Visits 7-day avg ${num(w.tabs)} · ${r.peopleReliable ? `people ${num(f.people)} · returning ${num(f.returning)}` : `people from ${dayLabel(PERSON_METRICS_FROM)}`} · new alerts ${r.people.newTrackings}`);
  const sources = new Map<string, number>();
  for (const s of r.sources) sources.set(sourceName(s.source), (sources.get(sourceName(s.source)) ?? 0) + s.n);
  if (sources.size) out.push(`From: ${[...sources].map(([k, n]) => `${esc(k)} ${n}`).join(" · ")}`);

  out.push("", "<b>Savings</b>");
  out.push(`Confirmed: ${formatTenge(r.savings.confirmed)} (${r.savings.confirmedCount} bought)`);
  out.push(`Drops caught: ${formatTenge(r.savings.dropsCaught)} on ${r.savings.dropsCaughtCount} products`);
  const a = r.alerts24h;
  out.push(`Alerts 24 h: ${a.products} products · ${a.messages.sent} messages sent${a.messages.failed ? `, ${a.messages.failed} failed` : ""} · ${a.clicks} clicks`);

  const c = r.collector;
  out.push("", "<b>Data today</b>");
  out.push(`Kaspi ${c.running ? "⏳ running" : c.runs ? "✅" : "❌"} ${num(c.requests)} requests · ${num(c.checked)} checked · ${num(c.changed)} price changes`);
  if (c.lastOk && c.aborted.length) out.push(`Kaspi: ${c.aborted.length} earlier stop${c.aborted.length > 1 ? "s" : ""} (${c.aborted.map(esc).join("; ")}), last run ok`);
  out.push(`Technodom ${r.store.aborted ? "⚠️" : "✅"} ${num(r.store.priced)} priced · ${r.store.cheaperThere} cheaper than Kaspi`);
  const recovered = failures.filter((f) => f.recovered);
  if (recovered.length) out.push(`GitHub: ${recovered.map((f) => `${esc(f.name)} failed ${f.failed}×, then ok`).join(" · ")}`);
  out.push(`${pct(share(r.catalog.fresh3d, r.catalog.products))} of ${num(r.catalog.products)} products fresh · ${num(r.catalog.seedQueue)} waiting to be added`);

  if (commits.length) {
    out.push("", `<b>Code</b> · ${commits.length} change${commits.length === 1 ? "" : "s"}`);
    for (const k of commits.slice(0, 3)) out.push(`• ${esc(headline(k.subject))}`);
    if (commits.length > 3) out.push(`  and ${commits.length - 3} more`);
  }
  return out.join("\n");
}
