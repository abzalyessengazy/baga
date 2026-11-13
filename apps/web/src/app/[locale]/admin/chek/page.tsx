import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatTenge } from "@baga/core";
import { getSql, type Digest } from "@baga/db";
import { adminEnabled, isAdmin } from "@/lib/admin";
import { todayDigest } from "@/lib/digest";
import { issueOf } from "@/lib/issue";
import { siteUrl } from "@/lib/site";
import { Link } from "@/i18n/navigation";
import { Best, Cover, Cta, Drop, Gap, Story, Wait, almatyTime, dmy, shortName, type Pair, type Tr } from "./Slides";
import { ChekTools, SlideFrame } from "./ChekTools";
import "./chek.css";

type Props = { params: Promise<{ locale: string }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const pct = (n: number) => (n < 0 ? `−${-n}%` : `+${n}%`);

/**
 * «Чек дня» slides for the owner (DECISIONS.md, 2026-11-13 "Slide page"): today's digest drawn in the brand
 * templates, each slide downloadable as a PNG in the browser, plus the caption in both languages. Replaces the
 * claude.ai scheduled task, which could not use the product photos. Behind the admin sign-in; read-only.
 */
export default async function ChekPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!adminEnabled() || !(await isAdmin())) notFound();
  const sql = getSql();
  if (!sql) notFound();
  const d = await todayDigest(sql);
  const ui = await getTranslations("chek");
  const t: Pair = {
    kk: (await getTranslations({ locale: "kk", namespace: "chek" })) as unknown as Tr,
    ru: (await getTranslations({ locale: "ru", namespace: "chek" })) as unknown as Tr,
  };
  const vk = await getTranslations({ locale: "kk", namespace: "verdict" });
  const vr = await getTranslations({ locale: "ru", namespace: "verdict" });
  const issue = issueOf(d.date);
  const shown = [...d.best, d.drop, d.gap, d.wait].filter((x) => x !== null);
  const latest = shown.map((x) => x.checkedAt).sort().at(-1);
  const meta = { date: d.date, issue: issue.label, time: latest ? almatyTime(latest) : "—" };
  const lead = d.best[0];
  const verdict = lead && lead.verdict !== "insufficient" ? { kk: vk(lead.verdict), ru: vr(lead.verdict) } : null;
  const utm = `?utm_source=ig&utm_medium=post&utm_campaign=${issue.campaign}`;
  const site = siteUrl();
  const links = shown.map((x) => `${shortName(x.title)}\n${site}/ru/p/${x.externalId}${utm}\n${site}/kk/p/${x.externalId}${utm}`).join("\n\n");

  return (
    <main className="wrap admin chek">
      <p className="admin-now"><Link href="/admin">{ui("back")}</Link></p>
      <h1>{ui("pageTitle")} · {issue.label} · {dmy(d.date)}</h1>
      <p>{ui("pageLead")}</p>
      {!d.complete && <p className="paste-error" role="alert">{ui("notReady")}</p>}
      {!lead ? <p>{ui("empty")}</p> : (
        <ChekTools labels={{ download: ui("download"), downloadAll: ui("downloadAll"), saving: ui("saving"), saveFailed: ui("saveFailed"), copy: ui("copy"), copied: ui("copied") }}
          prefix={`chek-${issue.campaign.slice(5)}-${d.date}`}
          texts={[{ title: ui("caption"), text: caption(d, t, meta, issue.label) }, { title: ui("linksTitle"), text: links }]}>
          <SlideFrame label={ui("slideCover")}><Cover d={d} t={t} meta={meta} /></SlideFrame>
          <SlideFrame label={t.ru("best")}><Best d={d} t={t} meta={meta} /></SlideFrame>
          {d.drop && <SlideFrame label={t.ru("drop")}><Drop x={d.drop} t={t} meta={meta} /></SlideFrame>}
          {d.gap && <SlideFrame label={t.ru("gap")}><Gap x={d.gap} t={t} meta={meta} /></SlideFrame>}
          {d.wait && <SlideFrame label={t.ru("wait")}><Wait x={d.wait} t={t} meta={meta} /></SlideFrame>}
          <SlideFrame label={ui("slideCta")}><Cta t={t} meta={meta} /></SlideFrame>
          <SlideFrame label={ui("slideStory")} story><Story d={d} t={t} meta={meta} verdict={verdict} /></SlideFrame>
        </ChekTools>
      )}
    </main>
  );
}

/** The post caption: Kazakh block, then Russian, then the not-affiliated line and tags. Numbers as in the digest. */
function caption(d: Digest, t: Pair, meta: { date: string; time: string }, issue: string): string {
  const block = (l: Tr) => {
    const lines = [l("capTitle", { issue, date: `${meta.date.slice(8, 10)}.${meta.date.slice(5, 7)}` }), l("capIntro"), l("capChecked", { date: dmy(meta.date), time: meta.time }), "", `↓ ${l("best")}`];
    d.best.forEach((x, i) => {
      const row = l("capRow", { i: String(i + 1).padStart(2, "0"), name: shortName(x.title), price: formatTenge(x.price), pct: pct(x.pct), days: x.observedDays });
      lines.push(x.oneSeller && x.cheapestSeller ? `${row} · ${l("capOneSeller", { shop: x.cheapestSeller })}` : row);
    });
    lines.push("");
    const shop = (x: { oneSeller: boolean; cheapestSeller: string | null }, line: string) =>
      x.oneSeller && x.cheapestSeller ? `${line} (${l("capOneSeller", { shop: x.cheapestSeller })})` : line;
    if (d.drop) lines.push(shop(d.drop, l("capDrop", { name: shortName(d.drop.title), diff: formatTenge(d.drop.diff), price: formatTenge(d.drop.price) })));
    if (d.gap) lines.push(l("capGap", { name: shortName(d.gap.title), lo: formatTenge(d.gap.price), hi: formatTenge(d.gap.hi), diff: formatTenge(d.gap.diff) }));
    if (d.wait) lines.push(shop(d.wait, l("capWait", { name: shortName(d.wait.title), pct: pct(d.wait.pct), price: formatTenge(d.wait.price) })));
    if (d.newLows.length) lines.push(l("capNewLows", { names: d.newLows.map((x) => shortName(x.title)).join(", ") }));
    lines.push(l("capMarket", { down: d.market.down, up: d.market.up }), "", l("capEnd"));
    return lines.join("\n");
  };
  return [block(t.kk), "—", block(t.ru), "", `${t.kk("disclaimer")} · ${t.ru("disclaimer")}`, "", t.ru("capTags")].join("\n");
}
