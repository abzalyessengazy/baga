import { describe, expect, it } from "vitest";
import { evaluateAlert, changeTarget, type TrackingAlertState } from "./alerts";

const H = 3_600_000;
const t0 = new Date("2026-11-01T00:00:00Z");
const at = (h: number) => new Date(t0.getTime() + h * H);
const start: TrackingAlertState = {
  trackingId: "t1", targetPrice: 1000, state: "armed", episode: 0, lastTriggeredAt: null, aboveSince: null,
};

/** Runs a price series through the machine, confirming every request, and returns the sent keys. */
function run(prices: [number, number][], s = start) {
  const sent: string[] = [];
  for (const [h, price] of prices) {
    let d = evaluateAlert(s, price, at(h), false);
    if (d.action === "confirm") d = evaluateAlert(s, price, at(h), true);
    if (d.action === "send") sent.push(d.idempotencyKey);
    s = d.next;
  }
  return { sent, s };
}

describe("alert state machine", () => {
  it("asks for confirmation before sending", () => {
    expect(evaluateAlert(start, 900, t0, false).action).toBe("confirm");
  });
  it("sends exactly once while the price stays below the target", () => {
    expect(run([[0, 1100], [1, 990], [2, 950], [3, 980], [4, 999]]).sent).toEqual(["t1:1"]);
  });
  it("does not re-alert when the price hovers just above the target", () => {
    // 1020 is within the 3% re-arm margin
    expect(run([[0, 990], [10, 1020], [40, 990], [100, 1020], [200, 995]]).sent).toEqual(["t1:1"]);
  });
  it("re-arms after 24h clearly above, then alerts on a real re-dip after the 72h gap", () => {
    const r = run([[0, 990], [10, 1100], [40, 1100], [50, 990], [80, 980]]);
    // at 50h: re-armed (above since 10h, 30h >= 24h) but only 50h since last alert -> blocked by 72h gap
    // at 80h: 80h since alert -> sends episode 2
    expect(r.sent).toEqual(["t1:1", "t1:2"]);
  });
  it("brief spikes above do not re-arm", () => {
    expect(run([[0, 990], [10, 1100], [20, 990], [30, 1100], [100, 990]]).sent).toEqual(["t1:1"]);
  });
  it("changing the target re-arms", () => {
    const { s } = run([[0, 990]]);
    expect(changeTarget(s, 900).state).toBe("armed");
  });
});
