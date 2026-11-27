"use client";

import { Children, useRef, useState, type ReactNode } from "react";

/**
 * One device's versions on the Black Friday page, side by side (the owner, 27 Nov 2026: «a slider … ensure the slider
 * or arrow is visible and not missed»). Native horizontal scroll with snap, so a phone swipes; big arrow buttons and
 * «1 / 6» in the card's head, the next version peeking in, and dots below. Without script it still scrolls.
 */
export function BfSlider({ head, children, prev, next, hint }: { head: ReactNode; children: ReactNode; prev: string; next: string; hint: string }) {
  const track = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children);
  const [at, setAt] = useState(0);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    const first = kids[0];
    if (!first) return;
    const x = (k: HTMLElement) => Math.abs(k.offsetLeft - first.offsetLeft - el.scrollLeft);
    let best = 0;
    kids.forEach((k, i) => { if (x(k) < x(kids[best] ?? first)) best = i; });
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) best = kids.length - 1;
    setAt(best);
  };
  const go = (i: number) => {
    const el = track.current;
    const k = el?.children[Math.max(0, Math.min(slides.length - 1, i))] as HTMLElement | undefined;
    if (el && k) el.scrollTo({ left: k.offsetLeft - (el.children[0] as HTMLElement).offsetLeft, behavior: "smooth" });
  };

  return (
    <div className="bf-slider">
      <div className="bf-ghead">
        {head}
        <div className="bf-nav">
          <button type="button" className="bf-arrow" onClick={() => go(at - 1)} disabled={at === 0} aria-label={prev}>‹</button>
          <span className="bf-count" aria-live="polite">{at + 1} / {slides.length}</span>
          <button type="button" className="bf-arrow" onClick={() => go(at + 1)} disabled={at === slides.length - 1} aria-label={next}>›</button>
        </div>
      </div>
      <div className="bf-track" ref={track} onScroll={onScroll}>
        {slides.map((s, i) => <div className="bf-slide" key={i}>{s}</div>)}
      </div>
      <div className="bf-dots" aria-hidden>
        {slides.map((_, i) => <button type="button" tabIndex={-1} key={i} className={i === at ? "is-on" : ""} onClick={() => go(i)} />)}
        {at < slides.length - 1 && <span className="bf-hint">{hint}</span>}
      </div>
    </div>
  );
}
