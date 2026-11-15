"use client";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle, formatCount } from "@baga/core";
import type { Market } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { cachedMarket, cachedStats, loadMarket, loadStats, type Stats, type StatsDrop, type StatsItem, type StatsMoves } from "@/lib/market";
import { dayMonth, type DatesT } from "@/lib/dayMonth";
import { useReplay } from "./Motion";

type L = "ru" | "kk";
const dropTitle = (d: { title: string; titleKk: string | null }, locale: L) => shortTitle((locale === "kk" && d.titleKk) || d.title);

/** Every list shows its first ten rows (the owner, 13 Nov); «Смотреть все →» opens the whole list. */
const ROWS = 10;

/** A product's picture in a list row; an empty square keeps the rows aligned when there is none. */
function Thumb({ src }: { src: string | null }) {
  return src ? <img className="z-thumb" src={src} alt="" width={32} height={32} loading="lazy" /> : <span className="z-thumb" aria-hidden />;
}

/**
 * One numbered row: place, picture, name with a second line, and the number on the right. Rows slide in one after
 * another each time their slip comes into view (useReplay), so the motion is seen where the visitor is looking.
 */
function Row({ i, go, k, href, thumb, name, sub, value, tone }: {
  i: number; go: boolean; k: string; href: string; thumb?: string | null; name: ReactNode; sub?: ReactNode; value: ReactNode; tone?: "down" | "up" | "plain";
}) {
  return (
    <motion.div key={k} initial={false} animate={go ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
      transition={go ? { type: "spring", stiffness: 320, damping: 30, delay: i * 0.055 } : { duration: 0 }}>
      <Link href={href} className={`z-row${thumb === undefined ? " no-thumb" : ""}${i === 0 ? " is-first" : ""}${tone ? ` is-${tone}` : ""}`}>
        <span className="z-rank" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
        {thumb !== undefined && <Thumb src={thumb} />}
        <span className="name"><span className="z-title">{name}</span>{sub && <span className="z-sub">{sub}</span>}</span>
        <span className="p">{value}</span>
      </Link>
    </motion.div>
  );
}

function Tabs<K extends string>({ id, value, set, options }: { id: string; value: K; set: (k: K) => void; options: [K, string][] }) {
  return (
    <span className="z-tabset">
      {options.map(([k, label]) => (
        <button key={k} type="button" className={`z-tab${value === k ? " is-on" : ""}`} aria-pressed={value === k} onClick={() => set(k)}>
          {value === k && <motion.span layoutId={`tab-${id}`} className="z-tab-ink" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span>{label}</span>
        </button>
      ))}
    </span>
  );
}

/** A slip's list area with its «Смотреть все →» foot. */
function Screen({ children, more, moreLabel, note }: { children: (go: boolean) => ReactNode; more?: string; moreLabel?: string; note?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = useReplay(ref, 0.12);
  return (
    <div className="slip-screen" ref={ref}>
      {children(go)}
      {(more || note) && (
        <div className="z-foot">
          {note && <span className="z-note">{note}</span>}
          {more && <Link href={more} className="z-all">{moreLabel} <span aria-hidden className="z-arrow">→</span></Link>}
        </div>
      )}
    </div>
  );
}

/**
 * A tab chosen on the home lists stays chosen for this browser tab: back from a product, the same list is there (the
 * owner, 12 and 15 Nov). Private mode without storage: the tabs reset, nothing else.
 */
function useSaved<K extends string>(key: string, allowed: readonly K[]): [K, (k: K) => void] {
  const [v, setV] = useState<K>(() => {
    let x = "";
    try { x = sessionStorage.getItem(`baga.tab.${key}`) ?? ""; } catch { /* no storage */ }
    return (allowed as readonly string[]).includes(x) ? (x as K) : allowed[0]!;
  });
  const set = (k: K) => { setV(k); try { sessionStorage.setItem(`baga.tab.${key}`, k); } catch { /* no storage */ } };
  return [v, set];
}

/**
 * Back to the home page puts the visitor where they left it (the owner, 15 Nov: «Back doesnt save anything»): the
 * page's scroll and the slip swiped to on a phone are noted when a link on the page is followed, and put back when the
 * home page comes back through the browser's Back (or Forward). Coming to it any other way starts at the top.
 */
const BACK_KEY = "baga.home.back";
let poppedAt = 0;
if (typeof window !== "undefined") window.addEventListener("popstate", () => { poppedAt = Date.now(); });
const cameBack = () => {
  if (Date.now() - poppedAt < 3000) return true;
  try { return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "back_forward"; } catch { return false; }
};
/** y: the page's scroll measured from the top of the lists, so sections above that load later do not move it. */
type Spot = { y: number; slip: number; at: number };

/* Price moves in percent (docs/STATS.md rules D and W). */
function MovesSlip({ moves, locale }: { moves: Stats["moves"]; locale: L }) {
  const t = useTranslations("home");
  // The tabs chosen stay chosen for this browser tab: back from a product, the same list is there (the owner, 12 Nov).
  const [dir, setDir] = useSaved<keyof StatsMoves>("moves-dir", ["drops", "rises"]);
  const [period, setPeriod] = useSaved<"day" | "week">("moves-period", ["day", "week"]);
  const rows = moves[period][dir].slice(0, ROWS);
  return (
    <Screen more={`/explore?list=${dir}`} moreLabel={t("explore")}>
      {(go) => (
        <>
          <div className="z-tabs">
            <Tabs id="moves-dir" value={dir} set={setDir} options={[["drops", `↓ ${t("tabDrops")}`], ["rises", `↑ ${t("tabRises")}`]]} />
            <Tabs id="moves-period" value={period} set={setPeriod} options={[["day", t("periodDay")], ["week", t("periodWeek")]]} />
          </div>
          {!rows.length && <p className="z-empty">{t("movesNone")}</p>}
          {rows.map((d, i) => (
            <Row key={`${dir}${period}${d.externalId}`} k={`${dir}${period}${d.externalId}`} i={i} go={go} href={`/p/${d.externalId}`} thumb={d.imageUrl}
              name={dropTitle(d, locale)} sub={<>{formatTenge(d.from, locale)} → {formatTenge(d.to, locale)}</>}
              value={<>{d.pct > 0 ? "+" : "−"}{Math.abs(d.pct)}%</>} tone={dir === "rises" ? "up" : "down"} />
          ))}
        </>
      )}
    </Screen>
  );
}

/* The same day's moves by the difference in tenge (the owner, 13 Nov): a 300 000 ₸ drop on a laptop leads here. */
function TengeSlip({ moves, locale }: { moves: StatsMoves; locale: L }) {
  const t = useTranslations("home");
  const [dir, setDir] = useSaved<keyof StatsMoves>("tenge-dir", ["drops", "rises"]);
  const rows = moves[dir].slice(0, ROWS);
  return (
    <Screen more={`/explore?list=${dir}`} moreLabel={t("explore")}>
      {(go) => (
        <>
          <div className="z-tabs"><Tabs id="tenge-dir" value={dir} set={setDir} options={[["drops", `↓ ${t("tabDrops")}`], ["rises", `↑ ${t("tabRises")}`]]} /></div>
          {!rows.length && <p className="z-empty">{t("movesNone")}</p>}
          {rows.map((d: StatsDrop, i) => (
            <Row key={`${dir}${d.externalId}`} k={`${dir}${d.externalId}`} i={i} go={go} href={`/p/${d.externalId}`} thumb={d.imageUrl}
              name={dropTitle(d, locale)} sub={<>{formatTenge(d.from, locale)} → {formatTenge(d.to, locale)}</>}
              value={<>{d.to > d.from ? "+" : "−"}{formatTenge(Math.abs(d.to - d.from), locale)}</>} tone={dir === "rises" ? "up" : "down"} />
          ))}
        </>
      )}
    </Screen>
  );
}

/* Plain product lists: most tracked, and newly added to the catalog. */
function ListSlip({ items, locale, dated, more }: { items: StatsItem[]; locale: L; dated?: boolean; more: string }) {
  const t = useTranslations("home");
  const td = useTranslations("dates") as unknown as DatesT;
  return (
    <Screen more={more} moreLabel={t("explore")}>
      {(go) => items.slice(0, ROWS).map((d, i) => (
        <Row key={d.externalId} k={d.externalId} i={i} go={go} href={`/p/${d.externalId}`} thumb={d.imageUrl}
          name={dropTitle(d, locale)} sub={dated ? dayMonth(d.at, td) : undefined}
          value={d.price !== null ? formatTenge(d.price, locale) : "—"} tone="plain" />
      ))}
    </Screen>
  );
}

/* The price that has stood still the longest: observed days in a row at one lowest price. */
function StableSlip({ items, locale }: { items: NonNullable<Stats["stable"]>; locale: L }) {
  const t = useTranslations("home");
  const td = useTranslations("dates") as unknown as DatesT;
  return (
    <Screen note={t("stableNote")}>
      {(go) => items.slice(0, ROWS).map((d, i) => (
        <Row key={d.externalId} k={d.externalId} i={i} go={go} href={`/p/${d.externalId}`} thumb={d.imageUrl}
          name={dropTitle(d, locale)} sub={t("stableDays", { days: d.days, since: dayMonth(d.since, td) })}
          value={d.price !== null ? formatTenge(d.price, locale) : "—"} tone="plain" />
      ))}
    </Screen>
  );
}

/* Seller spread: the same product, the cheapest and the dearest seller of its latest check. */
function SpreadSlip({ rows, locale }: { rows: Market["spread"]["top"]; locale: L }) {
  const t = useTranslations("home");
  return (
    <Screen more="/explore?list=spread" moreLabel={t("explore")}>
      {(go) => rows.slice(0, ROWS).map((s, i) => (
        <Row key={s.externalId} k={s.externalId} i={i} go={go} href={`/p/${s.externalId}`} thumb={s.imageUrl}
          name={dropTitle(s, locale)} sub={<>{formatTenge(s.lo, locale)} – {formatTenge(s.hi, locale)}</>}
          value={<>+{formatTenge(s.hi - s.lo, locale)}</>} tone="down" />
      ))}
    </Screen>
  );
}

/* The categories we watch the most products in: how many, from what price, and the week's median change. */
function CategorySlip({ rows, locale }: { rows: Market["categories"]; locale: L }) {
  const t = useTranslations("home");
  return (
    <Screen more="/explore?list=all" moreLabel={t("explore")}>
      {(go) => rows.slice(0, ROWS).map((c, i) => (
        <Row key={c.name} k={c.name} i={i} go={go} href={`/explore?list=all&cat=${encodeURIComponent(c.name)}`} thumb={c.imageUrl}
          name={c.name}
          sub={<>{t("catSub", { count: c.products })}{c.weekPct ? <> · {t("catWeek", { pct: `${c.weekPct > 0 ? "+" : "−"}${Math.abs(c.weekPct)}%` })}</> : null}</>}
          value={t("catFrom", { from: formatTenge(c.from, locale) })} tone="plain" />
      ))}
    </Screen>
  );
}

/* Shops by Kaspi's own rating: the highest and the lowest among those with enough reviews. Facts, not verdicts. */
function ShopsSlip({ shops }: { shops: NonNullable<Stats["shops"]> }) {
  const t = useTranslations("home");
  const [side, setSide] = useSaved<"top" | "low">("shops-side", ["top", "low"]);
  const count = (n: number) => formatCount(n);
  return (
    <Screen more="/shops?sort=rating" moreLabel={t("explore")} note={t("shopsNote")}>
      {(go) => (
        <>
          <div className="z-tabs"><Tabs id="shops-side" value={side} set={setSide} options={[["top", t("shopsTop")], ["low", t("shopsLow")]]} /></div>
          {shops[side].slice(0, ROWS).map((s, i) => (
            <Row key={`${side}${s.externalId}`} k={`${side}${s.externalId}`} i={i} go={go} href={`/s/${s.externalId}`}
              name={s.name} sub={t("shopSub", { reviews: count(s.reviews), count: s.products })}
              value={<><span aria-hidden>★ </span>{s.rating.toFixed(1)}</>} tone={side === "low" ? "up" : "down"} />
          ))}
        </>
      )}
    </Screen>
  );
}

/**
 * The home page lists: real platform numbers from /api/stats and /api/market, drawn on receipt slips, ten rows each.
 * On a phone the slips sit side by side and are swiped; the chips above jump to a slip. Nothing is shown until there
 * is a finished collector run, and never sample numbers in its place.
 */
export function ZReport() {
  const t = useTranslations("home");
  const locale = useLocale() as L;
  // Back from a product page the lists are drawn at once and at full height, so the browser returns to the same spot.
  const [s, setS] = useState<Stats | null>(() => cachedStats() ?? null);
  const [m, setM] = useState<Market | null>(() => cachedMarket() ?? null);
  const rail = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    let live = true;
    loadStats().then((j) => { if (live) setS(j); });
    loadMarket().then((x) => { if (live) setM(x); });
    return () => { live = false; };
  }, []);
  const ready = !!s?.lastRun && s.days.length > 0;
  const slips = !ready ? [] : [
    { id: "moves", title: t("movesTitle"), chip: t("chipMoves"), el: <MovesSlip moves={s!.moves} locale={locale} /> },
    ...(s!.tenge && (s!.tenge.drops.length || s!.tenge.rises.length) ? [{ id: "tenge", title: t("tengeTitle"), chip: t("chipTenge"), el: <TengeSlip moves={s!.tenge} locale={locale} /> }] : []),
    ...(m?.spread.top.length ? [{ id: "spread", title: t("spreadTitle"), chip: t("chipSpread"), el: <SpreadSlip rows={m.spread.top} locale={locale} /> }] : []),
    ...(s!.stable?.length ? [{ id: "stable", title: t("stableTitle"), chip: t("chipStable"), el: <StableSlip items={s!.stable} locale={locale} /> }] : []),
    ...(m?.categories.length ? [{ id: "cats", title: t("catTitle"), chip: t("chipCats"), el: <CategorySlip rows={m.categories} locale={locale} /> }] : []),
    ...(s!.shops && s!.shops.top.length ? [{ id: "shops", title: t("shopsTitle"), chip: t("chipShops"), el: <ShopsSlip shops={s!.shops} /> }] : []),
    ...(s!.mostTracked.length ? [{ id: "tracked", title: t("trackedTitle"), chip: t("chipTracked"), el: <ListSlip items={s!.mostTracked} locale={locale} more="/explore?list=all&sort=tracked" /> }] : []),
    ...(s!.newest.length ? [{ id: "new", title: t("newTitle"), chip: t("chipNew"), el: <ListSlip items={s!.newest} locale={locale} dated more="/explore?list=all&sort=new" /> }] : []),
  ];
  const n = slips.length;
  // The chip of the slip nearest the middle of the rail is the lit one (phones: the rail scrolls sideways).
  useEffect(() => {
    const el = rail.current;
    if (!el || !n) return;
    const on = () => {
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, d = Infinity;
      [...el.children].forEach((c, i) => {
        const x = (c as HTMLElement).offsetLeft - el.offsetLeft + (c as HTMLElement).offsetWidth / 2;
        if (Math.abs(x - mid) < d) { d = Math.abs(x - mid); best = i; }
      });
      setAt(best);
    };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [n]);
  // The lit chip stays in sight in its own row.
  const chips = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = chips.current, c = bar?.children[at] as HTMLElement | undefined;
    if (bar && c) bar.scrollTo({ left: c.offsetLeft - bar.offsetLeft - (bar.clientWidth - c.offsetWidth) / 2, behavior: "smooth" });
  }, [at]);
  // Note where the visitor is when they follow any link on the home page; put it back on Back.
  const atRef = useRef(at);
  atRef.current = at;
  useEffect(() => {
    const note = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || (a as HTMLAnchorElement).target === "_blank") return;
      const top = section.current ? section.current.getBoundingClientRect().top + window.scrollY : 0;
      const spot: Spot = { y: window.scrollY - top, slip: rail.current?.scrollLeft ?? 0, at: atRef.current };
      try { sessionStorage.setItem(BACK_KEY, JSON.stringify(spot)); } catch { /* no storage */ }
    };
    document.addEventListener("click", note, true);
    return () => document.removeEventListener("click", note, true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    let spot: Spot | null = null;
    try { spot = JSON.parse(sessionStorage.getItem(BACK_KEY) ?? "null") as Spot | null; sessionStorage.removeItem(BACK_KEY); } catch { /* no storage */ }
    if (!spot || !cameBack()) return;
    const s = spot;
    setAt(s.at);
    // Setting scrollLeft in code may fire no scroll event: tell the chips which slip is in sight.
    if (rail.current) { rail.current.scrollLeft = s.slip; rail.current.dispatchEvent(new Event("scroll")); }
    // Sections above and below still load (the board, the banner): keep putting the page back until it holds, for
    // three seconds at most, and stop at once if the visitor scrolls or taps.
    let stop = false;
    const quit = () => { stop = true; };
    const opts = { passive: true, once: true } as const;
    window.addEventListener("wheel", quit, opts);
    window.addEventListener("touchstart", quit, opts);
    window.addEventListener("keydown", quit, { once: true });
    const until = Date.now() + 3000;
    const put = () => {
      if (stop) return;
      const y = s.y + (section.current ? section.current.getBoundingClientRect().top + window.scrollY : 0);
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
      if (rail.current && Math.abs(rail.current.scrollLeft - s.slip) > 2) rail.current.scrollLeft = s.slip;
      if (Date.now() < until) requestAnimationFrame(put);
    };
    put();
    return () => { stop = true; window.removeEventListener("wheel", quit); window.removeEventListener("touchstart", quit); window.removeEventListener("keydown", quit); };
  }, [ready]);
  if (!ready) return null;
  const jump = (i: number) => {
    const el = rail.current, c = el?.children[i] as HTMLElement | undefined;
    if (!el || !c) return;
    // Sideways on a phone; on a wide screen the slips are a grid, so the page scrolls to the slip instead.
    if (el.scrollWidth > el.clientWidth + 4) el.scrollTo({ left: c.offsetLeft - el.offsetLeft - (el.clientWidth - c.offsetWidth) / 2, behavior: "smooth" });
    else c.scrollIntoView({ behavior: "smooth", block: "center" });
    setAt(i);
  };
  // Three in a row; a last row of two (or the last four as two rows of two) is set wider so no row ends short.
  const wide = n % 3 === 2 ? 2 : n % 3 === 1 ? (n === 1 ? 1 : 4) : 0;
  return (
    <section className="wrap section z-section" ref={section}>
      <h2 className="section-title">{t("zTitle")}</h2>
      <nav className="z-chips" aria-label={t("zTitle")} ref={chips}>
        {slips.map((x, i) => (
          <button key={x.id} type="button" className={`z-chip${i === at ? " is-on" : ""}`} onClick={() => jump(i)}>{x.chip}</button>
        ))}
      </nav>
      <div className="z-slips" ref={rail}>
        {slips.map((x, i) => (
          <article key={x.id} className={`slip${i >= n - wide ? (n === 1 ? " is-full" : " is-wide") : ""}`}>
            <div className="slip-caption"><h3>{x.title}</h3></div>
            {x.el}
          </article>
        ))}
      </div>
    </section>
  );
}
