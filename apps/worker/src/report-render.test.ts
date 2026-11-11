import { describe, expect, it } from "vitest";
import type { OwnerReport } from "@baga/db";
import { headline, renderOwnerReport, reportIssues } from "./report-render";

const now = new Date("2026-11-12T09:45:00Z");
const day = { visitors: 30, returning: 4, tabs: 32, productViews: 16, pastes: 3, tracks: 2, channels: 1 };
const base: OwnerReport = {
  day: "2026-11-11", funnel: day, funnelWeek: { ...day, visitors: 25, tracks: 1.4 }, utmVisitors: 6,
  sources: [{ source: "direct", n: 20 }, { source: "insta<post>", n: 6 }],
  collector: { runs: 1, requests: 1650, running: false, checked: 1600, changed: 40, failed: 2, aborted: [] },
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
      collector: { ...base.collector, requests: 300, aborted: ["429 <Too Many>"] },
      catalog: { ...base.catalog, fresh3d: 1000 },
      store: { ...base.store, startedAt: "2026-11-10T08:50:00Z", pendingMatches: 22 },
      alerts: { ...base.alerts, failed24h: 1 },
    }, now);
    expect(issues).toEqual([
      "Kaspi collector sent only 300 requests today",
      "Kaspi run stopped: 429 &lt;Too Many&gt;",
      "Only 65% of products checked in the last 3 days",
      "Technodom has not run for over 36 h",
      "1 notifications failed to send",
      "Review 22 Technodom matches (admin)",
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
    expect(html).toContain("Visitors      30  🎯100  🔴");
    expect(html).toContain("Open item    50%  🎯50%  ✅");
    expect(html).toContain("From posts   20%  🎯40%  🟡");
    expect(html).toContain("From: direct 20 · insta&lt;post&gt; 6");
    expect(html).toMatch(/Confirmed: 0\s₸ \(0 bought\)/);
    expect(html).toMatch(/Drops caught: 480\s389\s₸ in 3 alerts/);
    expect(html).toContain("Kaspi ✅ 1 650 requests");
    expect(html).toContain("• Fix &lt;b&gt; &amp; more");
    expect(html.length).toBeLessThan(4096);
  });
  it("leaves the code block out when nothing was pushed and lists at most three", () => {
    expect(renderOwnerReport(base, [], now)).not.toContain("<b>Code</b>");
    const many = Array.from({ length: 5 }, (_, i) => ({ hash: `h${i}`, subject: `Change number ${i}` }));
    expect(renderOwnerReport(base, many, now)).toContain("and 2 more");
  });
});
