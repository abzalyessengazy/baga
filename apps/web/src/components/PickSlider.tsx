"use client";
import { animate, motion, useMotionValue, useReducedMotion, type PanInfo } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle } from "@baga/core";
import type { MarketPick } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { PriceNoteChip } from "@/components/SellerChips";

type L = "ru" | "kk";
/** A find stays this long before the next one slides in. */
const STEP_MS = 6000;
/** After the visitor touches, drags or clicks, the slider waits this long before moving on by itself again. */
const RESUME_MS = 8000;
/** Space between slides (px), as in the CSS. */
const GAP = 12;
/** A swipe moves to the next find past this share of the width, or when flicked faster than SWIPE_SPEED px/s over
 * at least FLICK_MIN px (a tap that wobbles is not a swipe). */
const SWIPE_SHARE = 0.18;
const SWIPE_SPEED = 500;
const FLICK_MIN = 24;
const SPRING = { type: "spring", stiffness: 320, damping: 36, mass: 0.9 } as const;

/**
 * «Находки дня» (owner, 11 Nov 2026): the day's finds as slides in the receipt. The strip is moved by transform, so a
 * swipe follows the finger and always settles on exactly one find (owner, 11 Nov: native scroll snapping stopped
 * half-way on iPhone and was not smooth). It moves on by itself every STEP_MS with a paper-feed line filling the
 * active dot; a touch, drag, click or key pauses it, and it carries on RESUME_MS after the last one. It pauses while
 * the mouse is over it, off screen and in a hidden tab, and never moves by itself with reduced motion. One find: a
 * plain card.
 */
export function PickSlider({ picks }: { picks: MarketPick[] }) {
  const t = useTranslations("market");
  const locale = useLocale() as L;
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [visible, setVisible] = useState(false);
  const [heldAt, setHeldAt] = useState(0); // the last touch, drag, click or key (ms); 0 = none
  const [now, setNow] = useState(0);
  const dragged = useRef(false);
  const n = picks.length;
  const many = n > 1;
  const resting = heldAt === 0 || now - heldAt >= RESUME_MS;
  const running = many && !reduce && !hover && !hidden && visible && resting;

  const slideTo = useCallback((i: number) => {
    const to = ((i % n) + n) % n;
    setActive(to);
    animate(x, -to * (width + GAP), reduce ? { duration: 0 } : SPRING);
  }, [n, width, reduce, x]);
  const hold = useCallback(() => { const t0 = Date.now(); setHeldAt(t0); setNow(t0); }, []);

  // Width of one slide; on a resize the strip jumps to the active find without animating.
  useEffect(() => {
    const el = box.current;
    if (!el || !many) return;
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [many]);
  useEffect(() => { x.set(-active * (width + GAP)); }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only move while on screen and while the tab is shown.
  useEffect(() => {
    const el = box.current;
    if (!el || !many) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [many]);

  // After a pause, look again once RESUME_MS has passed.
  useEffect(() => {
    if (!heldAt || resting) return;
    const id = window.setTimeout(() => setNow(Date.now()), RESUME_MS - (now - heldAt) + 50);
    return () => window.clearTimeout(id);
  }, [heldAt, now, resting]);

  useEffect(() => {
    if (!running || !width) return;
    const id = window.setTimeout(() => slideTo(active + 1), STEP_MS);
    return () => window.clearTimeout(id);
  }, [running, active, width, slideTo]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const far = Math.abs(info.offset.x) > width * SWIPE_SHARE
      || (Math.abs(info.velocity.x) > SWIPE_SPEED && Math.abs(info.offset.x) > FLICK_MIN);
    const dir = far ? (info.offset.x < 0 ? 1 : -1) : 0;
    slideTo(Math.min(n - 1, Math.max(0, active + dir)));
    hold();
  };

  const card = (p: MarketPick, i: number) => (
    <Link
      key={p.externalId}
      href={`/p/${p.externalId}`}
      className="mk-pick"
      draggable={false}
      role={many ? "group" : undefined}
      aria-roledescription={many ? t("slide") : undefined}
      aria-label={many ? t("slideOf", { n: i + 1, total: n }) : undefined}
      aria-hidden={many && i !== active ? true : undefined}
      tabIndex={many && i !== active ? -1 : undefined}
      // A drag is not a click on the find under the finger.
      onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <p className="mk-label">{t(many ? "picksLabel" : "pickLabel")}</p>
      <div className="mk-pick-body">
        {p.imageUrl ? <img src={p.imageUrl} alt="" width={72} height={72} loading="lazy" draggable={false} /> : <span className="mk-pick-img" aria-hidden />}
        <div>
          <p className="mk-pick-title">{shortTitle((locale === "kk" && p.titleKk) || p.title)}</p>
          <p className="mk-pick-price">{formatTenge(p.price, locale)}</p>
          <p className="mk-pick-why">{t("pickDrop", { ref: formatTenge(p.ref, locale) })}</p>
          {p.note?.kind === "check" && <p className="chips"><PriceNoteChip note={p.note} bare /></p>}
        </div>
      </div>
      {/* The stamp lands on a find when it becomes the active one. */}
      <motion.span
        key={i === active ? `on-${active}` : "off"}
        className="stamp mk-pick-stamp"
        aria-hidden
        initial={reduce || !many || i !== active ? false : { scale: 1.5, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: -6 }}
        transition={{ type: "spring", stiffness: 480, damping: 24, delay: 0.25 }}
      >
        −{Math.abs(p.pct)}%
      </motion.span>
    </Link>
  );

  if (!n) return null;
  if (!many) return card(picks[0]!, 0);
  return (
    <section
      className="pick-slider"
      aria-roledescription={t("carousel")}
      aria-label={t("picksLabel")}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(false); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); slideTo(active + 1); hold(); }
        if (e.key === "ArrowLeft") { e.preventDefault(); slideTo(active - 1); hold(); }
      }}
    >
      <div ref={box} className="pick-viewport">
        <motion.div
          className="pick-track"
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -(n - 1) * (width + GAP), right: 0 }}
          dragElastic={0.14}
          dragMomentum={false}
          onPointerDown={() => { dragged.current = false; hold(); }}
          onDragStart={() => { dragged.current = true; }}
          onDragEnd={onDragEnd}
        >
          {picks.map(card)}
        </motion.div>
      </div>
      <div className="pick-controls">
        <button type="button" className="pick-arrow" onClick={() => { slideTo(active - 1); hold(); }} aria-label={t("prev")}>←</button>
        <div className="pick-dots">
          {picks.map((p, i) => (
            <button
              key={p.externalId}
              type="button"
              className="pick-dot"
              aria-current={i === active ? "true" : undefined}
              aria-label={t("slideOf", { n: i + 1, total: n })}
              onClick={() => { slideTo(i); hold(); }}
            >
              {i === active && running && <span key={`${active}-${heldAt}`} className="pick-feed" style={{ animationDuration: `${STEP_MS}ms` }} />}
            </button>
          ))}
        </div>
        <button type="button" className="pick-arrow" onClick={() => { slideTo(active + 1); hold(); }} aria-label={t("next")}>→</button>
      </div>
    </section>
  );
}
