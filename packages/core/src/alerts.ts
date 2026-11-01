import type { Tenge } from "./money";

/**
 * Target-price alert state machine.
 * armed --(price <= target, confirmed)--> triggered (send ONE alert)
 * triggered --(price > target*(1+rearmMargin) continuously for rearmAfterHours)--> armed
 * A minimum gap between alerts guards against flapping.
 */
export type AlertState = "armed" | "triggered";

export interface TrackingAlertState {
  trackingId: string;
  targetPrice: Tenge;
  state: AlertState;
  episode: number; // increments on every alert sent
  lastTriggeredAt: Date | null;
  aboveSince: Date | null; // when the price first went above the re-arm line while triggered
}

export const ALERT_CONFIG = {
  rearmMargin: 0.03,
  rearmAfterHours: 24,
  minHoursBetweenAlerts: 72,
} as const;

export type AlertDecision =
  | { action: "none"; next: TrackingAlertState }
  | { action: "confirm"; next: TrackingAlertState } // re-fetch the price before sending
  | { action: "send"; next: TrackingAlertState; idempotencyKey: string };

const HOUR = 3_600_000;

export function evaluateAlert(
  s: TrackingAlertState,
  price: Tenge,
  now: Date,
  confirmed: boolean,
  cfg = ALERT_CONFIG,
): AlertDecision {
  if (s.state === "armed") {
    if (price > s.targetPrice) return { action: "none", next: s };
    if (s.lastTriggeredAt && now.getTime() - s.lastTriggeredAt.getTime() < cfg.minHoursBetweenAlerts * HOUR) {
      return { action: "none", next: s };
    }
    if (!confirmed) return { action: "confirm", next: s };
    const episode = s.episode + 1;
    return {
      action: "send",
      idempotencyKey: `${s.trackingId}:${episode}`,
      next: { ...s, state: "triggered", episode, lastTriggeredAt: now, aboveSince: null },
    };
  }

  // triggered
  const rearmLine = s.targetPrice * (1 + cfg.rearmMargin);
  if (price <= rearmLine) return { action: "none", next: { ...s, aboveSince: null } };
  const aboveSince = s.aboveSince ?? now;
  if (now.getTime() - aboveSince.getTime() >= cfg.rearmAfterHours * HOUR) {
    return { action: "none", next: { ...s, state: "armed", aboveSince: null } };
  }
  return { action: "none", next: { ...s, aboveSince } };
}

/** When a user changes the target, the tracking re-arms immediately. */
export function changeTarget(s: TrackingAlertState, targetPrice: Tenge): TrackingAlertState {
  return { ...s, targetPrice, state: "armed", aboveSince: null };
}
