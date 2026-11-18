"use client";
import { useEffect, useState } from "react";
import { TrackPanel, type TrackInitial } from "./TrackPanel";

/**
 * The coupon on the cached product page (DECISIONS.md, 2026-11-16 "Cached product pages"): the page is the same for
 * everyone, so this visitor's own price, Telegram and email are read in the browser (/api/track?productId=) before
 * the coupon shows; on a failed read it shows as for a new visitor.
 */
export function TrackPanelLive({ productId, current, ready, related }: {
  productId: string; current: number | null; ready: { botReady: boolean; emailReady: boolean }; related?: React.ReactNode;
}) {
  const [initial, setInitial] = useState<TrackInitial | null>(null);
  useEffect(() => {
    let live = true;
    const blank: TrackInitial = { ...ready, target: null, dropPct: null, linked: false, telegramUrl: null, email: { address: null, confirmed: false }, push: false };
    fetch(`/api/track?productId=${productId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<TrackInitial>) : blank))
      .catch(() => blank)
      .then((v) => { if (live) setInitial(v); });
    return () => { live = false; };
  }, [productId, ready]);
  if (!initial) return <div className="track-wait" aria-hidden />;
  return <TrackPanel productId={productId} current={current} initial={initial} related={related} />;
}
