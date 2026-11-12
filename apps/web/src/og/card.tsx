import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import type { Spark } from "@/lib/ogSpark";
import ru from "../../messages/ru.json";
import kk from "../../messages/kk.json";

/**
 * The link preview image (Open Graph, 1200×630): a receipt on the steel counter, as on the site. Shared by the
 * product page and the home page. Every word comes from messages (`og`, `verdict`); prices and the chart only from
 * observed data. No image from Kaspi: drawing it here would make our server request Kaspi (CLAUDE.md rule 6).
 * Fonts: static Onest and JetBrains Mono (OFL, src/og/fonts), since the renderer reads neither woff2 nor variable fonts.
 */
export const OG_SIZE = { width: 1200, height: 630 };

const C = { counter: "#dde0e4", paper: "#fbfbf7", ink: "#1d2025", soft: "#5d6168", faint: "#8b8f96", stamp: "#4b3fd1", red: "#c23b2c" };
const dir = () => join(process.cwd(), "src", "og", "fonts");

/**
 * Messages for the image files. Never getTranslations there: Next also resolves image metadata while it streams a
 * page's metadata to the browser, outside the request scope getTranslations needs, and that error stopped every
 * product page's scripts (12 Nov 2026).
 */
export function ogMessages(locale: string, namespace: "og" | "verdict" | "dates") {
  const L = locale === "kk" ? "kk" : "ru";
  return createTranslator({ locale: L, messages: L === "kk" ? kk : ru, namespace });
}
export const ogT = (locale: string) => ogMessages(locale, "og");

export async function ogFonts() {
  const f = (name: string) => readFile(join(dir(), name));
  const [on4, on7, jb4, jb7] = await Promise.all([f("Onest-Regular.ttf"), f("Onest-Bold.ttf"), f("JetBrainsMono-Regular.ttf"), f("JetBrainsMono-Bold.ttf")]);
  return [
    { name: "Onest", data: on4, weight: 400 as const, style: "normal" as const },
    { name: "Onest", data: on7, weight: 700 as const, style: "normal" as const },
    { name: "Mono", data: jb4, weight: 400 as const, style: "normal" as const },
    { name: "Mono", data: jb7, weight: 700 as const, style: "normal" as const },
  ];
}

/** A long Kaspi title cut at a word, so it fits two lines. */
export function shortTitle(title: string, max = 84): string {
  if (title.length <= max) return title;
  const cut = title.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

const Rule = () => <div style={{ display: "flex", height: 0, borderTop: `3px dashed ${C.faint}`, opacity: 0.55 }} />;

function Frame({ tag, site, children, footer }: { tag: string; site: string; children: React.ReactNode; footer?: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: C.counter, padding: "40px 56px", fontFamily: "Onest" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, background: C.paper, padding: "36px 48px 30px", borderRadius: 6,
        boxShadow: "0 24px 48px -24px rgba(29,32,37,0.45)", color: C.ink }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "Mono", marginBottom: 22 }}>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: 2 }}>BAĞA</span>
          <span style={{ fontSize: 20, color: C.soft, letterSpacing: 3 }}>{tag}</span>
        </div>
        <Rule />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 26 }}>{children}</div>
        <Rule />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Mono", fontSize: 21, color: C.soft, paddingTop: 18 }}>
          <span>{footer ?? ""}</span>
          <span style={{ color: C.stamp, fontWeight: 700 }}>{site}</span>
        </div>
      </div>
    </div>
  );
}

export interface ProductCard {
  locale: "ru" | "kk"; tag: string; site: string; title: string;
  /** "Самая низкая цена сейчас" with the price, or "Сейчас нет в продаже" with the last price (smaller). */
  label: string; price: string | null; note: string | null;
  /** The verdict's short label; red only for "high" (design language). */
  verdict: { text: string; high: boolean } | null;
  spark: Spark | null; chartLabel: string;
  footer: string;
}

const CHART = { w: 420, h: 170 };

export function productCard(p: ProductCard) {
  return (
    <Frame tag={p.tag} site={p.site} footer={p.footer}>
      <div style={{ display: "flex", fontSize: 44, fontWeight: 700, lineHeight: 1.18, maxHeight: 106, overflow: "hidden" }}>{p.title}</div>
      <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, paddingRight: 24 }}>
          <span style={{ fontSize: 24, color: C.soft }}>{p.label}</span>
          {p.price && <span style={{ fontFamily: "Mono", fontSize: 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>{p.price}</span>}
          {p.note && <span style={{ fontFamily: "Mono", fontSize: 28, color: C.soft, marginTop: 6 }}>{p.note}</span>}
          {p.verdict && (
            <div style={{ display: "flex", marginTop: 14 }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1,
                color: p.verdict.high ? C.red : C.stamp, border: `4px solid ${p.verdict.high ? C.red : C.stamp}`, borderRadius: 6,
                padding: "6px 16px", whiteSpace: "nowrap", transform: "rotate(-3deg)" }}>{p.verdict.text.toLocaleUpperCase(p.locale === "kk" ? "kk-KZ" : "ru-RU")}</span>
            </div>
          )}
        </div>
        {p.spark && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 1, overflow: "hidden" }}>
            <svg width={CHART.w} height={CHART.h} viewBox={`0 0 ${CHART.w} ${CHART.h}`}>
              {p.spark.lines.map((pts) => <polyline key={pts} points={pts} fill="none" stroke={C.ink} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />)}
              {p.spark.dots.map((d) => <circle key={`${d.x}`} cx={d.x} cy={d.y} r={4} fill={C.ink} />)}
              <circle cx={p.spark.last.x} cy={p.spark.last.y} r={9} fill={C.stamp} />
            </svg>
            <span style={{ fontSize: 19, color: C.faint, marginTop: 8 }}>{p.chartLabel}</span>
          </div>
        )}
      </div>
    </Frame>
  );
}
export const OG_CHART = CHART;

export function homeCard(p: { tag: string; site: string; headline: string; sub: string }) {
  return (
    <Frame tag={p.tag} site={p.site}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", paddingBottom: 20 }}>
        <span style={{ fontSize: 70, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>{p.headline}</span>
        <span style={{ fontSize: 32, color: C.soft, marginTop: 26, lineHeight: 1.3, maxWidth: 900 }}>{p.sub}</span>
      </div>
    </Frame>
  );
}
