import { describe, expect, it } from "vitest";
import type { OwnerReport } from "@baga/db";
import { renderOwnerReport, reportIssues } from "./report-render";

const now = new Date("2026-11-12T09:45:00Z");
const day = { visitors: 30, returning: 4, tabs: 32, productViews: 16, pastes: 3, tracks: 2, channels: 1 };
const base: OwnerReport = {
  day: "2026-11-11", funnel: day, funnelWeek: { ...day, visitors: 25, tracks: 1.4 }, utmVisitors: 6,
  sources: [{ source: "direct", n: 20 }, { source: "insta<post>", n: 6 }],
  collector: { runs: 1, requests: 1650, checked: 1600, changed: 40, failed: 2, aborted: [] },
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
      "22 Technodom matches wait for your review (admin)",
    ]);
    expect(reportIssues({ ...base, collector: { ...base.collector, runs: 0 } }, now)).toEqual(["Kaspi collector did not run today"]);
  });
});

describe("renderOwnerReport", () => {
  it("shows the day, targets, savings kept apart and escaped text", () => {
    const html = renderOwnerReport(base, [{ hash: "abc1234", subject: "Fix <b> & more" }], now);
    expect(html).toContain("<b>BAĞA daily · 11 Nov</b>");
    expect(html).toContain("✅ All normal");
    expect(html).toContain("Visitors 30 ↑ (25) · returning 4 · target 100/day 🔴");
    expect(html).toContain("Opened a product 16 of 32 visits · 50% ✅");
    expect(html).toContain("From posts (utm) 6 · 20% 🟡");
    expect(html).toContain("insta&lt;post&gt; 6");
    expect(html).toMatch(/Confirmed saved: 0\s₸/);
    expect(html).toMatch(/Drops caught \(not necessarily bought\): 480\s389\s₸ in 3 alerts/);
    expect(html).toContain("<code>abc1234</code> Fix &lt;b&gt; &amp; more");
    expect(html.length).toBeLessThan(4096);
  });
  it("says when nothing was pushed", () => {
    expect(renderOwnerReport(base, [], now)).toContain("No changes");
  });
});
