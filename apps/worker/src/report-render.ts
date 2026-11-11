import { formatTenge, share, targetMark, TARGETS, type TargetMark } from "@baga/core";
import type { OwnerReport } from "@baga/db";

/**
 * The daily owner report as one Telegram message (HTML). For the owner only, so it is in English like the rest of
 * the owner's tooling; every number comes from ownerReport (packages/db/src/report.ts). Issues first, then users,
 * savings, data and code.
 */
export interface Commit { hash: string; subject: string }

/** A collection day with fewer requests than this is reported as a problem (a full day is ~1,600). */
export const LOW_REQUESTS = 800;

const MARK: Record<TargetMark, string> = { on: "✅", half: "🟡", off: "🔴" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const pct = (r: number) => `${Math.round(r * 100)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

function trend(now: number, avg: number): string {
  if (avg === 0) return now > 0 ? "↑" : "→";
  const r = now / avg;
  return r >= 1.15 ? "↑" : r <= 0.85 ? "↓" : "→";
}

/** What needs the owner's attention; empty on a normal day. */
export function reportIssues(r: OwnerReport, now = new Date()): string[] {
  const out: string[] = [];
  const c = r.collector;
  if (c.runs === 0) out.push("Kaspi collector did not run today");
  else if (c.requests < LOW_REQUESTS) out.push(`Kaspi collector sent only ${num(c.requests)} requests today`);
  for (const a of c.aborted) out.push(`Kaspi run stopped: ${a}`);
  if (r.catalog.products > 0 && share(r.catalog.fresh3d, r.catalog.products) < 0.9) {
    out.push(`Only ${pct(share(r.catalog.fresh3d, r.catalog.products))} of products checked in the last 3 days`);
  }
  if (!r.store.startedAt) out.push("Technodom has never run");
  else if (now.getTime() - new Date(r.store.startedAt).getTime() > 36 * 3600_000) out.push("Technodom has not run for over 36 h");
  if (r.store.aborted) out.push(`Technodom run stopped: ${r.store.aborted}`);
  if (r.manual24h.blocked > 0) out.push(`Manual checks blocked by Kaspi (${r.manual24h.blocked})`);
  if (r.alerts.failed24h > 0) out.push(`${r.alerts.failed24h} notifications failed to send`);
  if (r.store.pendingMatches > 0) out.push(`${r.store.pendingMatches} Technodom matches wait for your review (admin)`);
  return out.map(esc);
}

export function renderOwnerReport(r: OwnerReport, commits: Commit[], now = new Date()): string {
  const issues = reportIssues(r, now);
  const f = r.funnel;
  const w = r.funnelWeek;
  const openRate = share(f.productViews, f.tabs);
  const connected = share(r.people.connected, r.people.watchers);
  const utm = share(r.utmVisitors, f.visitors);
  const lines: string[] = [];

  lines.push(`<b>BAĞA daily · ${dayLabel(r.day)}</b>`);
  lines.push(issues.length === 0 ? "✅ All normal" : `⚠️ ${issues.length} to look at`);
  if (issues.length) lines.push(...issues.map((i) => `• ${i}`));

  lines.push("", `<b>Users · ${dayLabel(r.day)}</b> (vs 7-day avg) · targets for ${dayLabel(TARGETS.by)}`);
  lines.push(`Visitors ${num(f.visitors)} ${trend(f.visitors, w.visitors)} (${w.visitors}) · returning ${num(f.returning)} · target ${TARGETS.visitorsPerDay}/day ${MARK[targetMark(w.visitors, TARGETS.visitorsPerDay)]}`);
  lines.push(`Opened a product ${num(f.productViews)} of ${num(f.tabs)} visits · ${pct(openRate)} ${MARK[targetMark(openRate, TARGETS.productOpenRate)]} (target ${pct(TARGETS.productOpenRate)})`);
  lines.push(`Pasted a link ${num(f.pastes)} · started tracking ${num(f.tracks)} ${trend(f.tracks, w.tracks)} (${w.tracks})`);
  lines.push(`New alerts: ${r.people.newTrackings} in 24 h, ${r.people.newTrackings7d} in 7 days ${MARK[targetMark(r.people.newTrackings7d, TARGETS.alertsPerWeek)]} (target ${TARGETS.alertsPerWeek}/week)`);
  lines.push(`People with alerts ${r.people.watchers} (+${r.people.newWatchers}) · connected ${r.people.connected} (${pct(connected)}) ${MARK[targetMark(connected, TARGETS.connectedRate)]} (target ${pct(TARGETS.connectedRate)})`);
  lines.push(`From posts (utm) ${num(r.utmVisitors)} · ${pct(utm)} ${MARK[targetMark(utm, TARGETS.utmShare)]} (target ${pct(TARGETS.utmShare)})`);
  if (r.sources.length) lines.push(`Sources: ${r.sources.map((s) => `${esc(s.source)} ${s.n}`).join(", ")}`);

  lines.push("", "<b>Savings</b>");
  lines.push(`Confirmed saved: ${formatTenge(r.savings.confirmed)} · ${r.savings.confirmedCount} purchases · «Да, купил» ${r.alerts.boughtYes} of ${r.alerts.boughtAnswered} answers ${MARK[targetMark(r.alerts.boughtYes, TARGETS.boughtYes)]} (target ${TARGETS.boughtYes})`);
  lines.push(`Drops caught (not necessarily bought): ${formatTenge(r.savings.dropsCaught)} in ${r.savings.dropsCaughtCount} alerts`);
  lines.push(`Alerts sent in 24 h: ${r.alerts.targetSent24h} target, ${r.alerts.firstPriceSent24h} first price`);

  const c = r.collector;
  lines.push("", "<b>Data · today</b>");
  lines.push(`Kaspi: ${num(c.requests)} requests, ${num(c.checked)} checked, ${num(c.changed)} changed, ${num(c.failed)} failed`);
  lines.push(`Products ${num(r.catalog.products)} · checked ≤3 days ${pct(share(r.catalog.fresh3d, r.catalog.products))} · in stock ${num(r.catalog.inStock)}`);
  lines.push(`History: ${num(r.catalog.history7d)} with 7+ days, ${num(r.catalog.history30d)} with 30+ days`);
  lines.push(`Queue: ${num(r.catalog.seedQueue)} new products, ${num(r.catalog.linksWaiting)} links`);
  lines.push(`Technodom: ${r.store.compared} compared, cheaper there on ${r.store.cheaperThere} · 24 h: ${num(r.store.requests)} requests, ${num(r.store.priced)} priced, ${r.store.failed} failed`);
  lines.push(`City prices (24 h) ${num(r.cityPrices24h)} · manual checks ${r.manual24h.done} done, ${r.manual24h.failed} failed`);

  lines.push("", `<b>Code · 24 h</b>`);
  if (commits.length === 0) lines.push("No changes");
  for (const k of commits.slice(0, 6)) lines.push(`• <code>${esc(k.hash)}</code> ${esc(k.subject.length > 90 ? `${k.subject.slice(0, 89)}…` : k.subject)}`);
  if (commits.length > 6) lines.push(`… and ${commits.length - 6} more`);
  return lines.join("\n");
}
