import { describe, expect, it } from "vitest";
import { validPushSubscription } from "./push";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
describe("push subscription check", () => {
  it("keeps the subscriptions of real push services", () => {
    for (const endpoint of ["https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QG9", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x"])
      expect(validPushSubscription({ endpoint, keys })?.endpoint).toBe(endpoint);
  });
  it("refuses any other address, so the collector never posts where a visitor points it", () => {
    for (const endpoint of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x", "https://u@web.push.apple.com/x", "https://127.0.0.1/x"])
      expect(validPushSubscription({ endpoint, keys })).toBeNull();
  });
  it("refuses broken keys", () => {
    expect(validPushSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "short", auth: keys.auth } })).toBeNull();
    expect(validPushSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: keys.p256dh, auth: "a/b+c=defghijk" } })).toBeNull();
    expect(validPushSubscription(null)).toBeNull();
  });
});
