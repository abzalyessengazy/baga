"use client";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle } from "@baga/core";
import type { MarketPick } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { PriceNoteChip } from "@/components/SellerChips";

type L = "ru" | "kk";
/** Seconds a find stays before the next one slides in. */
const STEP_MS = 6000;

/**
 * «Находки дня» (owner, 11 Nov 2026): the day's finds as slides in the receipt. Native scroll with snapping, so a
 * phone swipes it like any list; arrows on wide screens; dots. It moves on by itself every STEP_MS with a paper-feed
 * line filling under the dots, pauses while the pointer is over it, the tab is hidden or it is off screen, and stops
 * for good once the visitor swipes, clicks or uses the keys. With reduced motion it never moves by itself. One find:
 * a plain card.
 */
export function PickSlider({ picks }: { picks: MarketPick[] }) {
  const t = useTranslations("market");
  const locale = useLocale() as L;
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const auto = useRef(false);
  const many = picks.length > 1;
  const running = many && !reduce && !stopped && !paused && visible;

  const go = useCallback((i: number, byUser: boolean) => {
    const el = track.current;
    if (!el) return;
    if (byUser) setStopped(true);
    auto.current = !byUser;
    const n = picks.length;
    const to = ((i % n) + n) % n;
    const slide = el.children[to] as HTMLElement | undefined;
    if (slide) el.scrollTo({ left: slide.offsetLeft, behavior: reduce ? "auto" : "smooth" });
  }, [picks.length, reduce]);

  // Which slide is in view, from the scroll position (swipes, arrows and the timer all end up here).
  useEffect(() => {
    const el = track.current;
    if (!el || !many) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      // The slide whose left edge is nearest the scroll position (slides have a gap between them).
      raf = requestAnimationFrame(() => {
        const xs = Array.from(el.children, (c) => Math.abs((c as HTMLElement).offsetLeft - el.scrollLeft));
        setActive(xs.indexOf(Math.min(...xs)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [many]);

  // Only advance while on screen and while the tab is shown.
  useEffect(() => {
    const el = track.current;
    if (!el || !many) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    const vis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [many]);

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => go(active + 1, false), STEP_MS);
    return () => window.clearTimeout(id);
  }, [running, active, go]);

  const card = (p: MarketPick, i: number) => (
    <Link
      key={p.externalId}
      href={`/p/${p.externalId}`}
      className="mk-pick"
      role={many ? "group" : undefined}
      aria-roledescription={many ? t("slide") : undefined}
      aria-label={many ? t("slideOf", { n: i + 1, total: picks.length }) : undefined}
      tabIndex={many && i !== active ? -1 : undefined}
    >
      <p className="mk-label">{t(many ? "picksLabel" : "pickLabel")}</p>
      <div className="mk-pick-body">
        {p.imageUrl ? <img src={p.imageUrl} alt="" width={72} height={72} loading="lazy" /> : <span className="mk-pick-img" aria-hidden />}
        <div>
          <p className="mk-pick-title">{shortTitle((locale === "kk" && p.titleKk) || p.title)}</p>
          <p className="mk-pick-price">{formatTenge(p.price, locale)}</p>
          <p className="mk-pick-why">{t("pickDrop", { ref: formatTenge(p.ref, locale) })}</p>
          {p.note?.kind === "check" && <p className="chips"><PriceNoteChip note={p.note} bare /></p>}
        </div>
      </div>
      {/* The stamp lands on each find as it comes into view. */}
      <motion.span
        key={i === active ? `on-${p.externalId}` : p.externalId}
        className="stamp mk-pick-stamp"
        aria-hidden
        initial={reduce || !many ? false : { scale: 1.6, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: -6 }}
        transition={{ type: "spring", stiffness: 520, damping: 22, delay: 0.15 }}
      >
        −{Math.abs(p.pct)}%
      </motion.span>
    </Link>
  );

  if (!picks.length) return null;
  if (!many) return card(picks[0]!, 0);
  return (
    <section
      className="pick-slider"
      aria-roledescription={t("carousel")}
      aria-label={t("picksLabel")}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setPaused(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setPaused(document.hidden); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1, true); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1, true); }
      }}
    >
      <div
        ref={track}
        className="pick-track"
        // A finger or the wheel on the track means the visitor took over: no more automatic moves.
        onPointerDown={() => setStopped(true)}
        onWheel={(e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) setStopped(true); }}
      >
        {picks.map(card)}
      </div>
      <div className="pick-controls">
        <button type="button" className="pick-arrow" onClick={() => go(active - 1, true)} aria-label={t("prev")}>←</button>
        <div className="pick-dots">
          {picks.map((p, i) => (
            <button
              key={p.externalId}
              type="button"
              className="pick-dot"
              aria-current={i === active ? "true" : undefined}
              aria-label={t("slideOf", { n: i + 1, total: picks.length })}
              onClick={() => go(i, true)}
            >
              {i === active && running && <span key={`${active}`} className="pick-feed" style={{ animationDuration: `${STEP_MS}ms` }} />}
            </button>
          ))}
        </div>
        <button type="button" className="pick-arrow" onClick={() => go(active + 1, true)} aria-label={t("next")}>→</button>
      </div>
    </section>
  );
}
