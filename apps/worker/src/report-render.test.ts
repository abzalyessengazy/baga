import { describe, expect, it } from "vitest";
import type { OwnerReport } from "@baga/db";
import { headline, renderOwnerReport, reportIssues } from "./report-render";

const now = new Date("2026-11-12T09:45:00Z");
const day = { people: 30, returning: 4, tabs: 32, productViews: 16, pastes: 3, tracks: 2, channels: 1 };
const base: OwnerReport = {
  day: "2026-11-11", funnel: day, funnelWeek: { ...day, people: 25, tabs: 26, tracks: 1.4 }, utmVisits: 6,
  peopleReliable: true, weekPeopleReliable: true,
  alerts24h: { products: 1, people: 1, triggers: 1, targetMessages: 2, messages: { sent: 3, failed: 0, waiting: 0 }, clicks: 1, clickedProducts: 1 },
  sources: [{ source: "direct", n: 20 }, { source: "insta<post>", n: 6 }],
  collector: { runs: 1, requests: 1650, running: false, checked: 1600, changed: 40, failed: 2, aborted: [], lastOk: true },
  catalog: { products: 1534, fresh3d: 1460, inStock: 1400, history7d: 640, history30d: 0, seedQueue: 1200, linksWaiting: 0 },
  store: { startedAt: "2026-11-12T08:50:00Z", requests: 210, priced: 164, failed: 0, aborted: null, pendingMatches: 0, compared: 160, cheaperThere: 12 },
  cityPrices24h: 40, manual24h: { done: 2, failed: 0, blocked: 0 },
  people: { watchers: 22, newWatchers: 1, connected: 10, activeTrackings: 30, newTrackings: 2, newTrackings7d: 18 },
  alerts: { targetSent24h: 1, firstPriceSent24h: 2, failed24h: 0, boughtYes: 0, boughtAnswered: 2 },
  savings: { confirmed: 0, confirmedCount: 0, dropsCaught: 480389, dropsCaughtCount: 3 },
};

describe("reportIssues", () => {
  it("is empty on a normal day", () => {
    expect(reportIssues(base, now)).toEqual([]);
  });
  it("flags a missing or short collector day, a stop, stale data and a quiet store", () => {
    const issues = reportIssues({
      ...base,
      collector: { ...base.collector, requests: 300, aborted: ["429 <Too Many>"], lastOk: false },
      catalog: { ...base.catalog, fresh3d: 1000 },
      store: { ...base.store, startedAt: "2026-11-10T08:50:00Z", pendingMatches: 22 },
      alerts: { ...base.alerts, failed24h: 1 },
    }, now);
    expect(issues).toEqual([
      "Kaspi collector sent only 300 requests today",
      "Kaspi run stopped: 429 &lt;Too Many&gt;",
      "Only 65% of products checked in the last 3 days",
      "The store run (Technodom, Sulpak) has not run for over 36 h",
      "1 notifications failed to send",
      "Review 22 store matches (admin)",
    ]);
    expect(reportIssues({ ...base, collector: { ...base.collector, runs: 0 } }, now)).toEqual(["Kaspi collector did not run today"]);
  });
});

describe("reportIssues while the collector runs", () => {
  it("does not call a running day short", () => {
    expect(reportIssues({ ...base, collector: { ...base.collector, running: true, requests: 300 } }, now)).toEqual([]);
  });
});

describe("headline", () => {
  it("keeps a commit subject up to its first colon or bracket", () => {
    expect(headline("Week 1 of the owner's 30-day plan: a daily owner report")).toBe("Week 1 of the owner's 30-day plan");
    expect(headline("More checks from the same Kaspi rules (the owner, 10 Nov): robots")).toBe("More checks from the same Kaspi rules");
    expect(headline("Fix: x")).toBe("Fix: x");
    expect(headline("a".repeat(80))).toHaveLength(60);
  });
});

describe("renderOwnerReport", () => {
  it("shows the day, an aligned target table, savings kept apart and escaped text", () => {
    const html = renderOwnerReport(base, [{ hash: "abc1234", subject: "Fix <b> & more" }], now);
    expect(html).toContain("<b>BAĞA · 11 Nov</b>");
    expect(html).toContain("✅ All normal");
    expect(html).toContain("People/day    30  🎯100  🔴");
    expect(html).toContain("Open item    50%  🎯50%  ✅");
    expect(html).toContain("From posts   19%  🎯40%  🔴");
    expect(html).toContain("From: direct 20 · insta&lt;post&gt; 6");
    expect(html).toMatch(/Confirmed: 0\s₸ \(0 bought\)/);
    expect(html).toMatch(/Drops caught: 480\s389\s₸ on 3 products/);
    expect(html).toContain("Alerts 24 h: 1 products · 3 messages sent · 1 clicks");
    expect(html).toContain("Kaspi ✅ 1 650 requests");
    expect(html).toContain("• Fix &lt;b&gt; &amp; more");
    expect(html.length).toBeLessThan(4096);
  });
  it("counts visits, not people, until browser ids cover the days", () => {
    const html = renderOwnerReport({ ...base, peopleReliable: false, weekPeopleReliable: false }, [], now);
    expect(html).toContain("Visits/day    32  🎯100  🔴");
    expect(html).toContain("people from 12 Nov");
    expect(html).not.toContain("returning 4");
  });
  it("leaves the code block out when nothing was pushed and lists at most three", () => {
    expect(renderOwnerReport(base, [], now)).not.toContain("<b>Code</b>");
    const many = Array.from({ length: 5 }, (_, i) => ({ hash: `h${i}`, subject: `Change number ${i}` }));
    expect(renderOwnerReport(base, many, now)).toContain("and 2 more");
  });
  it("flags a failed workflow with no good run since and notes a recovered one", () => {
    const failures = [{ name: "Nightly backup", failed: 1, recovered: false }, { name: "Collect prices", failed: 2, recovered: true }];
    expect(reportIssues(base, now, failures)).toEqual(["GitHub: Nightly backup failed, no good run since"]);
    expect(renderOwnerReport(base, [], now, { failures })).toContain("GitHub: Collect prices failed 2×, then ok");
  });
  it("puts the CTO note on top, escaped, or says why it was withheld", () => {
    const html = renderOwnerReport(base, [], now, { cto: { note: "• Backup <failed>: run it again (you)." } });
    expect(html.split("\n").slice(0, 3).join("\n")).toBe("<b>BAĞA · 11 Nov</b>\n🧠 <b>CTO</b>\n• Backup &lt;failed&gt;: run it again (you).");
    expect(renderOwnerReport(base, [], now, { cto: { withheld: "it cited 70, not in the data" } })).toContain("<i>CTO note withheld: it cited 70, not in the data.</i>");
    expect(renderOwnerReport(base, [], now, { cto: null })).not.toContain("CTO");
  });
  it("moves Kaspi stops behind a clean later run out of «Needs you»", () => {
    const r = { ...base, collector: { ...base.collector, aborted: ["failure share 25% over 12 checks"], lastOk: true } };
    expect(reportIssues(r, now)).toEqual([]);
    expect(renderOwnerReport(r, [], now)).toContain("Kaspi: 1 earlier stop (failure share 25% over 12 checks), last run ok");
    expect(reportIssues({ ...r, collector: { ...r.collector, lastOk: false } }, now)).toEqual(["Kaspi run stopped: failure share 25% over 12 checks"]);
  });
});
