"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { lastTracking, openTracking, STATE_EVENT, type TrackState } from "@/lib/trackCta";

/** Whether this visitor tracks the product, from TrackPanel (unknown until it has loaded: then nothing is shown). */
function useTracking(): boolean | null {
  const [tracking, setTracking] = useState<boolean | null>(null);
  useEffect(() => {
    setTracking(lastTracking());
    const on = (e: Event) => setTracking((e as CustomEvent<TrackState>).detail.tracking);
    window.addEventListener(STATE_EVENT, on);
    return () => window.removeEventListener(STATE_EVENT, on);
  }, []);
  return tracking;
}

const Bell = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 8.5a5 5 0 0 1 10 0c0 4 1.6 5.3 1.6 5.3H3.4S5 12.5 5 8.5Z" /><path d="M8.2 16.6a2 2 0 0 0 3.6 0" />
  </svg>
);

/** Under the verdict: the first thing people read, one tap to the coupon. */
export function TrackJump() {
  const t = useTranslations("track");
  const tracking = useTracking();
  if (tracking !== false) return null;
  return (
    <button type="button" className="btn btn-stamp track-jump" onClick={openTracking}>
      <Bell /> {t("ctaButton")}
    </button>
  );
}

/**
 * Fixed at the bottom on phones while neither the jump button nor the coupon is on screen, for someone who does not
 * track the product yet. Not on wide screens, where the coupon stands beside the receipt.
 */
export function TrackBar() {
  const t = useTranslations("track");
  const tracking = useTracking();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (tracking !== false) return;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting);
      setShow(![...seen.values()].some(Boolean));
    });
    const targets = [document.querySelector(".track-jump"), document.querySelector(".product-grid > .side-panel")].filter((x): x is Element => !!x);
    for (const el of targets) { seen.set(el, false); io.observe(el); }
    return () => io.disconnect();
  }, [tracking]);
  if (tracking !== false) return null;
  return (
    <div className={`track-bar${show ? " is-on" : ""}`} aria-hidden={!show}>
      <button type="button" className="track-bar-btn" onClick={openTracking} tabIndex={show ? 0 : -1}>
        <span className="track-bar-icon"><Bell /></span>
        <span className="track-bar-text"><b>{t("ctaButton")}</b><small>{t("ctaSub")}</small></span>
        <span aria-hidden className="track-bar-go">↓</span>
      </button>
    </div>
  );
}
