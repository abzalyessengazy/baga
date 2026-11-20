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
  it("re-arms after 20h clearly above, then alerts on a real re-dip after the 48h gap", () => {
    // at 40h: re-armed (above since 10h); at 45h only 45h since the alert -> held by the 48h gap; at 50h: episode 2
    expect(run([[0, 990], [10, 1100], [40, 1100], [45, 990], [50, 990]]).sent).toEqual(["t1:1", "t1:2"]);
  });
  it("catches a drop on day 3 with daily checks a few minutes under 24h apart (audit 20 Nov 2026)", () => {
    expect(run([[0, 990], [23.97, 1200], [47.93, 1250], [71.9, 900]]).sent).toEqual(["t1:1", "t1:2"]);
  });
  it("brief spikes above do not re-arm", () => {
    expect(run([[0, 990], [10, 1100], [20, 990], [30, 1100], [100, 990]]).sent).toEqual(["t1:1"]);
  });
  it("changing the target re-arms", () => {
    const { s } = run([[0, 990]]);
    expect(changeTarget(s, 900).state).toBe("armed");
  });
  it("a new target is not held back by the pause after the last alert", () => {
    const { s } = run([[0, 990]]);
    const lowered = changeTarget(s, 900);
    expect(lowered.lastTriggeredAt).toBeNull();
    expect(evaluateAlert(lowered, 890, new Date(s.lastTriggeredAt!.getTime() + 24 * 3_600_000), true).action).toBe("send");
    expect(changeTarget(s, s.targetPrice).lastTriggeredAt).toEqual(s.lastTriggeredAt);
  });
});
