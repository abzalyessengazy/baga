import type { ReactNode } from "react";
import { formatTenge } from "@baga/core";
import type { Digest, DigestMove } from "@baga/db";

/**
 * The «Чек дня» slides, drawn from today's digest in the owner's social templates (claude.ai design canvas, 13 Nov):
 * 1080×1350 posts and a 1080×1920 story, Kazakh line first, Russian under it. Every number comes from the digest;
 * the product photo is the link the site already shows, loaded by the owner's browser (our server never fetches it).
 */

/** One line of slide copy in both languages: kk from kk.json, ru from ru.json (same key). */
export type Tr = (key: string, values?: Record<string, string | number>) => string;
export type Pair = { kk: Tr; ru: Tr };
export type VerdictLabel = { kk: string; ru: string } | null;

/** The CTA coupon's example price, stamped ҮЛГІ / ОБРАЗЕЦ (rule 2). */
const SAMPLE_PRICE = 56_600;
const tg = (n: number) => formatTenge(n);
const pct = (n: number) => (n < 0 ? `−${-n}%` : `+${n}%`);
/** Kaspi titles carry specs after " / " (laptops): the slides show the part before. */
export const shortName = (title: string) => title.split(" / ")[0]!.trim();
export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
export const almatyTime = (iso: string) => new Date(Date.parse(iso) + 5 * 3_600_000).toISOString().slice(11, 16);

const BAGA_PATH =
  "M7.7 46H32.2Q42.5 46 47.95 51Q53.4 56 53.4 64.6Q53.4 70.6 50.45 74.15Q47.5 77.7 42 79.3V79.9Q48.5 81.5 52.05 85.5Q55.6 89.5 55.6 96.6Q55.6 105.4 50.05 110.6Q44.5 115.8 34.5 115.8H7.7ZM29.9 105.3Q35.3 105.3 37.8 103.5Q40.3 101.7 40.3 96.9V94Q40.3 89.2 37.8 87.4Q35.3 85.6 29.9 85.6H22.3V105.3ZM28 75.6Q33.3 75.6 35.7 73.85Q38.1 72.1 38.1 67.5V64.5Q38.1 59.9 35.7 58.2Q33.3 56.5 28 56.5H22.3V75.6Z M143.5 115.8 139.1 99H120L115.7 115.8H100.5L119.4 46H140.6L159.5 115.8ZM130 60.5H129.2L122.4 86.9H136.8Z M241.1 105.9H240.2Q239.3 108.1 238 110.1Q236.7 112.1 234.8 113.65Q232.9 115.2 230.35 116.1Q227.8 117 224.6 117Q219.5 117 215.55 114.6Q211.6 112.2 208.9 107.6Q206.2 103 204.85 96.4Q203.5 89.8 203.5 81.5Q203.5 63.7 210 54.25Q216.5 44.8 230.1 44.8Q235.5 44.8 239.6 46.25Q243.7 47.7 246.65 50.35Q249.6 53 251.5 56.7Q253.4 60.4 254.5 64.9L240.5 68.3Q239.9 66.1 239.15 64.05Q238.4 62 237.2 60.4Q236 58.8 234.2 57.85Q232.4 56.9 229.8 56.9Q224.1 56.9 221.75 61.6Q219.4 66.3 219.4 74.8V86.2Q219.4 94.7 221.95 99.8Q224.5 104.9 231 104.9Q236.1 104.9 238.6 101.9Q241.1 98.9 241.1 94.2V89.1H229.2V78.5H254.5V115.8H241.1Z M343.5 115.8 339.1 99H320L315.7 115.8H300.5L319.4 46H340.6L359.5 115.8ZM330 60.5H329.2L322.4 86.9H336.8Z";

function Mark() {
  return (
    <svg viewBox="0 0 360 120" height="44" role="img" aria-label="BAĞA">
      <path fill="var(--ink)" d={BAGA_PATH} />
      <path d="M211.4 8q0 20.5 18.6 20.5q18.6 0 18.6-20.5" fill="none" stroke="var(--violet)" strokeWidth="9.8" strokeLinecap="round" />
    </svg>
  );
}

function Photo({ src, className, style }: { src: string | null; className: string; style?: React.CSSProperties }) {
  if (!src) return null;
  return <span className={className} style={style}><img src={src} alt="" /></span>;
}

export type Meta = { date: string; issue: string; time: string };

function Top({ meta, right }: { meta: Meta; right?: ReactNode }) {
  return (
    <div className="ck-top"><Mark /><div className="ck-meta">{right ?? <>{dmy(meta.date)}<br />{meta.issue}</>}</div></div>
  );
}

function Pill({ t, k, violet }: { t: Pair; k: string; violet?: boolean }) {
  return <div className={violet ? "ck-pill ck-v" : "ck-pill"}><span>{t.kk(k)}</span><small>{t.ru(k)}</small></div>;
}

function Foot({ t, left = "linksBelow" }: { t: Pair; left?: string }) {
  return (
    <>
      <div className="ck-grow" />
      <div className="ck-foot"><div><b>{t.kk(left)}</b><br />{t.ru(left)}</div><div><b>bagaapp.com</b></div></div>
      <div className="ck-disc">{t.kk("disclaimer")} · {t.ru("disclaimer")}</div>
    </>
  );
}

function Slide({ id, story, children }: { id: string; story?: boolean; children: ReactNode }) {
  return <div className={story ? "ck-root ck-story" : "ck-root"} data-slide={id}>{children}</div>;
}

const sellerLine = (t: Pair, x: { oneSeller: boolean; cheapestSeller: string | null }) =>
  x.oneSeller && x.cheapestSeller ? <div className="ck-lbl ck-seller ck-ell">{t.kk("almatyShop", { shop: x.cheapestSeller })}</div> : null;

export function Cover({ d, t, meta }: { d: Digest; t: Pair; meta: Meta }) {
  const lead = d.best[0];
  return (
    <Slide id="1-cover">
      <Top meta={meta} />
      <Pill t={t} k="daily" violet />
      <h1 className="ck-hkk" style={{ fontSize: 112, lineHeight: "106px" }}>{t.kk("daily")}</h1>
      <p className="ck-hru" style={{ fontSize: 56, lineHeight: "62px" }}>{t.ru("daily")}</p>
      <div className="ck-rel" style={{ marginTop: 64 }}>
        <div className="ck-rc" style={{ transform: "rotate(-1.5deg)" }}>
          <div className="ck-row"><span className="ck-lbl"><b>{t.kk("today")}</b> / {t.ru("today")}</span><span className="ck-lbl">{t.kk("checkedAt", { time: meta.time })}</span></div>
          <hr className="ck-rule" />
          <Line t={t} k="bestShort" v={d.best.length ? t.kk("items", { n: d.best.length }) : null} />
          <Line t={t} k="dropShort" v={d.drop && `−${tg(d.drop.diff)}`} color="var(--violet)" />
          <Line t={t} k="gapShort" v={d.gap && tg(d.gap.diff)} />
          <Line t={t} k="waitShort" v={d.wait && `↑ ${pct(d.wait.pct)}`} color="var(--rise)" />
          <hr className="ck-rule" />
          <div className="ck-row"><span className="ck-lbl"><b>{t.kk("total")}</b> / {t.ru("total")}</span>
            <span className="ck-mono" style={{ fontSize: 30, fontWeight: 700 }}><span style={{ color: "var(--violet)" }}>↓ {d.market.down}</span><span style={{ color: "var(--rise)", marginLeft: 24 }}>↑ {d.market.up}</span></span></div>
          <div className="ck-bar" />
        </div>
        {lead && <div className="ck-stamp" style={{ right: -24, top: -84, fontSize: 64, lineHeight: "70px" }}>{pct(lead.pct)}</div>}
      </div>
      <Foot t={t} left="swipe" />
    </Slide>
  );
}

function Line({ t, k, v, color }: { t: Pair; k: string; v: string | null; color?: string }) {
  if (!v) return null;
  return <div className="ck-row ck-ss" style={{ marginTop: 14 }}><span>{t.kk(k)} <span className="ck-ru">· {t.ru(k)}</span></span><b className="ck-mono" style={{ color }}>{v}</b></div>;
}

export function Best({ d, t, meta }: { d: Digest; t: Pair; meta: Meta }) {
  return (
    <Slide id="2-best">
      <Top meta={meta} />
      <Pill t={t} k="best" />
      <h2 className="ck-hkk" style={{ marginTop: 24, fontSize: 48, lineHeight: "52px" }}>{t.kk("bestHead")}</h2>
      <p className="ck-hru" style={{ fontSize: 32, lineHeight: "38px" }}>{t.ru("bestHead")}</p>
      <div className="ck-rc" style={{ marginTop: 24, paddingTop: 26, paddingBottom: 24 }}>
        <div className="ck-row"><span className="ck-lbl"><b>{t.kk("now")}</b> / {t.ru("now")}</span><span className="ck-lbl">{t.kk("weekAgo")} / {t.ru("weekAgo")}</span></div>
        <hr className="ck-rule" style={{ margin: "16px 0 22px" }} />
        {d.best.map((x, i) => (
          <div key={x.externalId}>
            {i > 0 && <hr className="ck-rule" style={{ margin: "8px 0" }} />}
            <div className="ck-row" style={{ alignItems: "center" }}>
              <span className="ck-name ck-line">
                {x.imageUrl ? <Photo src={x.imageUrl} className="ck-ph" style={{ width: 60, height: 60 }} /> : <span className="ck-ph" style={{ width: 60, height: 60 }} />}
                <span className="ck-mono ck-muted" style={{ fontWeight: 500 }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="ck-ell">{shortName(x.title)}</span>
              </span>
              <span className="ck-price">{tg(x.price)}</span>
            </div>
            <div className="ck-row" style={{ marginTop: 2, paddingLeft: 74 }}>
              <span className="ck-was">{tg(x.was)}</span>
              {x.oneSeller && x.cheapestSeller && <span className="ck-lbl ck-ell" style={{ flex: 1 }}>{t.kk("almatyShop", { shop: x.cheapestSeller })}</span>}
              <span className="ck-chip">↓ {pct(x.pct)}</span>
            </div>
          </div>
        ))}
      </div>
      <Foot t={t} />
    </Slide>
  );
}

export function Drop({ x, t, meta }: { x: DigestMove; t: Pair; meta: Meta }) {
  return (
    <Slide id="3-drop">
      <Top meta={meta} />
      <Pill t={t} k="drop" />
      <div style={{ marginTop: 40 }}><span className="ck-mono ck-mk" style={{ fontSize: 120, lineHeight: "128px", fontWeight: 700, letterSpacing: "-.04em" }}>−{tg(x.diff)}</span></div>
      <p className="ck-ss" style={{ margin: "18px 0 0" }}>{t.kk("dropSub")} <span className="ck-muted">· {t.ru("dropSub")}</span></p>
      <div className="ck-rel" style={{ marginTop: 56 }}>
        <div className="ck-rc" style={{ paddingBottom: 40 }}>
          <Photo src={x.imageUrl} className="ck-php" style={{ right: 52, top: 56, width: 140, height: 140 }} />
          {x.category && <div className="ck-lbl" style={{ paddingRight: 170 }}>{x.category}</div>}
          <div className="ck-name ck-clamp" style={{ marginTop: 10, fontSize: 38, lineHeight: "46px", paddingRight: 170, minHeight: 100 }}>{shortName(x.title)}</div>
          {sellerLine(t, x)}
          <hr className="ck-rule" />
          <div className="ck-lbl"><b>{t.kk("now")}</b> / {t.ru("now")}</div>
          <div className="ck-pxl" style={{ marginTop: 8, fontSize: 100, lineHeight: "100px" }}>{tg(x.price)}</div>
          <div className="ck-row" style={{ marginTop: 18 }}><span className="ck-was" style={{ fontSize: 32 }}>{tg(x.was)}</span><span className="ck-lbl">{t.kk("weekAgo")} / {t.ru("weekAgo")}</span></div>
          <div className="ck-bar" />
        </div>
        <div className="ck-stamp" style={{ right: 28, top: -40, fontSize: 52, lineHeight: "58px" }}>{pct(x.pct)}</div>
      </div>
      <Foot t={t} />
    </Slide>
  );
}

export function Gap({ x, t, meta }: { x: NonNullable<Digest["gap"]>; t: Pair; meta: Meta }) {
  return (
    <Slide id="4-gap">
      <Top meta={meta} />
      <Pill t={t} k="gap" />
      <h2 className="ck-hkk" style={{ marginTop: 28, fontSize: 64, lineHeight: "68px" }}>{t.kk("gapHead")}</h2>
      <p className="ck-hru">{t.ru("gapHead")}</p>
      <div className="ck-rc" style={{ marginTop: 32, paddingBottom: 28 }}>
        <Photo src={x.imageUrl} className="ck-php" style={{ right: 52, top: 40, width: 110, height: 110 }} />
        <div className="ck-name ck-clamp" style={{ fontSize: 40, lineHeight: "48px", paddingRight: 140, minHeight: 96 }}>{shortName(x.title)}</div>
        <hr className="ck-rule" />
        <div className="ck-row"><div><div className="ck-lbl"><b>{t.kk("cheapest")}</b></div><div className="ck-lbl">{t.ru("cheapest")}</div></div><span className="ck-price" style={{ fontSize: 56, lineHeight: "60px", color: "var(--violet)" }}>{tg(x.price)}</span></div>
        <hr className="ck-rule" />
        <div className="ck-row"><div><div className="ck-lbl"><b>{t.kk("dearest")}</b></div><div className="ck-lbl">{t.ru("dearest")}</div></div><span className="ck-price" style={{ fontSize: 56, lineHeight: "60px", color: "var(--muted)", textDecoration: "line-through" }}>{tg(x.hi)}</span></div>
      </div>
      <div className="ck-coupon">
        <div className="ck-row"><div><div className="ck-lbl"><b>{t.kk("difference")}</b> / {t.ru("difference")}</div><div className="ck-ss" style={{ marginTop: 6 }}>{t.kk("compare")} <span className="ck-muted">· {t.ru("compare")}</span></div></div>
          <span className="ck-mono ck-mk" style={{ fontSize: 56, lineHeight: "64px", fontWeight: 700 }}>{tg(x.diff)}</span></div>
      </div>
      <Foot t={t} />
    </Slide>
  );
}

export function Wait({ x, t, meta }: { x: DigestMove; t: Pair; meta: Meta }) {
  return (
    <Slide id="5-wait">
      <Top meta={meta} />
      <Pill t={t} k="wait" />
      <h2 className="ck-hkk" style={{ marginTop: 28, fontSize: 64, lineHeight: "68px" }}>{t.kk("waitHead")}</h2>
      <p className="ck-hru">{t.ru("waitHead")}</p>
      <div className="ck-rc" style={{ marginTop: 24, paddingBottom: 22 }}>
        <Photo src={x.imageUrl} className="ck-php" style={{ right: 52, top: 44, width: 150, height: 150 }} />
        {x.category && <div className="ck-lbl" style={{ paddingRight: 180 }}>{x.category}</div>}
        <div className="ck-name ck-clamp" style={{ marginTop: 10, fontSize: 44, lineHeight: "52px", paddingRight: 180, minHeight: 112 }}>{shortName(x.title)}</div>
        {sellerLine(t, x)}
        <hr className="ck-rule" />
        <div className="ck-row"><span className="ck-lbl"><b>{t.kk("weekAgo")}</b> / {t.ru("weekAgo")}</span><span className="ck-price">{tg(x.was)}</span></div>
        <div className="ck-row" style={{ marginTop: 8 }}><span className="ck-lbl"><b>{t.kk("now")}</b> / {t.ru("now")}</span><span className="ck-price" style={{ fontSize: 64, lineHeight: "68px" }}>{tg(x.price)}</span></div>
        <div className="ck-row" style={{ marginTop: 8 }}><span /><span className="ck-chip ck-up" style={{ fontSize: 36, lineHeight: "50px" }}>↑ {pct(x.pct)}</span></div>
        <hr className="ck-rule" />
        <div style={{ fontSize: 26, lineHeight: "34px" }}>{t.kk("coupon")}</div>
        <div className="ck-muted" style={{ fontSize: 26, lineHeight: "34px", marginTop: 6 }}>{t.ru("coupon")}</div>
      </div>
      <Foot t={t} />
    </Slide>
  );
}

export function Cta({ t, meta }: { t: Pair; meta: Meta }) {
  return (
    <Slide id="6-cta">
      <Top meta={meta} right="bagaapp.com" />
      <h2 className="ck-hkk" style={{ marginTop: 96, fontSize: 96, lineHeight: "94px" }}>{t.kk("ctaHead")}</h2>
      <p className="ck-hru" style={{ fontSize: 56, lineHeight: "62px" }}>{t.ru("ctaHead")}</p>
      <div className="ck-rc" style={{ marginTop: 64, paddingBottom: 40 }}>
        {(["step1", "step2", "step3"] as const).map((k, i) => (
          <div key={k}>
            {i > 0 && <hr className="ck-rule" />}
            <div className="ck-row ck-ss"><b className="ck-mono" style={{ color: "var(--violet)" }}>0{i + 1}</b><span style={{ flex: 1 }}>{t.kk(k)} <span className="ck-muted">· {t.ru(k)}</span></span></div>
          </div>
        ))}
      </div>
      <div className="ck-coupon ck-rel">
        <div className="ck-row"><span className="ck-lbl"><b>{t.kk("couponLabel")}</b> / {t.ru("couponLabel")}</span></div>
        <div className="ck-row" style={{ marginTop: 10 }}><span className="ck-price" style={{ fontSize: 64, lineHeight: "68px" }}>{tg(SAMPLE_PRICE)}</span><span className="ck-lbl" style={{ textAlign: "right" }}><b>{t.kk("yourPrice")}</b><br />{t.ru("yourPrice")}</span></div>
        <div className="ck-stamp" style={{ left: 400, top: 66, fontSize: 30, lineHeight: "34px" }}>{t.kk("sample")} / {t.ru("sample")}</div>
      </div>
      <Foot t={t} left="everyDay" />
    </Slide>
  );
}

export function Story({ d, t, meta, verdict }: { d: Digest; t: Pair; meta: Meta; verdict: VerdictLabel }) {
  const x = d.best[0]!;
  return (
    <Slide id="7-story" story>
      <div style={{ height: 124 }} />
      <Top meta={meta} right={dmy(meta.date)} />
      <div className="ck-pill ck-v" style={{ marginTop: 72 }}><span>{t.kk("dailyReady")}</span><small>{t.ru("dailyReady")}</small></div>
      <h1 className="ck-hkk" style={{ marginTop: 40, fontSize: 128, lineHeight: "120px" }}>{t.kk("storyToday")} <span className="ck-mk">{pct(x.pct)}</span></h1>
      <p className="ck-hru" style={{ fontSize: 60, lineHeight: "66px" }}>{t.ru("storyToday", { pct: pct(x.pct) })}</p>
      <div className="ck-rel" style={{ marginTop: 72 }}>
        <div className="ck-rc" style={{ transform: "rotate(2deg)", paddingTop: 72 }}>
          <div className="ck-lbl ck-ell" style={{ paddingRight: 200 }}>{shortName(x.title)}</div>
          <div className="ck-pxl" style={{ marginTop: 12 }}>{tg(x.price)}</div>
          <div className="ck-row" style={{ marginTop: 14 }}><span className="ck-was">{tg(x.was)}</span><span className="ck-lbl">{t.kk("days", { n: x.observedDays })} · {t.ru("days", { n: x.observedDays })}</span></div>
          <div className="ck-bar" />
        </div>
        <Photo src={x.imageUrl} className="ck-php" style={{ right: 36, top: -30, width: 170, height: 170, transform: "rotate(-4deg)", boxShadow: "0 18px 40px rgba(28,30,34,.18)" }} />
        {verdict && <div className="ck-stamp" style={{ left: -12, top: -46, fontSize: 40, lineHeight: "46px" }}>{verdict.kk}</div>}
      </div>
      <div className="ck-rc" style={{ marginTop: 72, padding: "36px 48px 44px" }}>
        <div className="ck-lbl"><b>{t.kk("inCheck")}</b> / {t.ru("inCheck")}</div>
        <hr className="ck-rule" style={{ margin: "16px 0" }} />
        <Line t={t} k="bestShort" v={t.kk("items", { n: d.best.length })} />
        <Line t={t} k="dropShort" v={d.drop && `−${tg(d.drop.diff)}`} color="var(--violet)" />
        <Line t={t} k="gapShort" v={d.gap && tg(d.gap.diff)} />
      </div>
      <div className="ck-grow" />
      <div className="ck-ss" style={{ textAlign: "center", marginBottom: 300 }}><b>{t.kk("newPost")}</b> <span className="ck-muted">· {t.ru("newPost")}</span></div>
    </Slide>
  );
}
