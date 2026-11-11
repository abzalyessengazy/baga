/**
 * The in-house funnel, browser side (DECISIONS.md, 2026-11-03 "In-house funnel instead of PostHog"). One random id
 * per tab in sessionStorage joins the steps of a visit. Since 11 Nov (DECISIONS.md, "An anonymous visitor id") one
 * more random id per browser in localStorage counts unique and returning visitors; no cookie, no name, no IP.
 * Fire-and-forget: a failed or blocked beacon never affects the page.
 */
export type FunnelStep = "visit" | "paste" | "product_view" | "track" | "channel";
const SID_KEY = "baga.sid";

const VID_KEY = "baga.vid";

function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_");
}

/** The id kept under key, created on first use; null when the storage is blocked (even reading it can throw). */
function stored(store: () => Storage, key: string): string | null {
  try {
    const st = store();
    let v = st.getItem(key);
    if (!v) {
      v = randomId();
      st.setItem(key, v);
    }
    return v;
  } catch {
    return null;
  }
}

/** One per tab: joins the steps of a visit. */
const sid = () => stored(() => sessionStorage, SID_KEY);
/** One per browser, kept until the visitor clears site data: unique and returning visitors. */
const vid = () => stored(() => localStorage, VID_KEY);

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
    name, sid: id, vid: vid() ?? undefined, locale: document.documentElement.lang,
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
