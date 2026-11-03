/**
 * The in-house funnel, browser side (DECISIONS.md, 2026-11-03 "In-house funnel instead of PostHog"). One random id
 * per tab in sessionStorage joins the steps of a visit; nothing is kept after the tab closes, no cookie is set.
 * Fire-and-forget: a failed or blocked beacon never affects the page.
 */
export type FunnelStep = "visit" | "paste" | "product_view" | "track" | "channel";
const SID_KEY = "baga.sid";

function sid(): string | null {
  try {
    let v = sessionStorage.getItem(SID_KEY);
    if (!v) {
      const b = crypto.getRandomValues(new Uint8Array(12));
      v = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_");
      sessionStorage.setItem(SID_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}

/** Where the visit came from: ?utm_source=…, else the referring site's host, else "direct". */
function source(): string {
  const utm = new URLSearchParams(location.search).get("utm_source");
  if (utm) return utm.toLowerCase().slice(0, 64);
  try {
    const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
    return host && host !== location.hostname ? host.slice(0, 64) : "direct";
  } catch {
    return "direct";
  }
}

export function track(name: FunnelStep, opts: { externalId?: string; detail?: string } = {}) {
  const id = sid();
  if (!id) return;
  const body = JSON.stringify({
    name, sid: id, locale: document.documentElement.lang,
    device: matchMedia("(pointer: coarse)").matches || innerWidth < 768 ? "mobile" : "desktop",
    source: name === "visit" ? source() : undefined,
    externalId: opts.externalId && /^\d{5,12}$/.test(opts.externalId) ? opts.externalId : undefined,
    detail: opts.detail,
  });
  try {
    if (!navigator.sendBeacon?.("/api/e", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/e", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // blocked: the funnel just misses this step
  }
}

/** Once per tab: the first page of a visit. */
export function trackVisit() {
  try {
    if (sessionStorage.getItem("baga.visit")) return;
    sessionStorage.setItem("baga.visit", "1");
  } catch {
    return;
  }
  track("visit");
}
