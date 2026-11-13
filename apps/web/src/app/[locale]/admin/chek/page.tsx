import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSql } from "@baga/db";
import { adminEnabled, isAdmin } from "@/lib/admin";
import { todayDigest } from "@/lib/digest";
import { issueOf } from "@/lib/issue";
import { siteUrl } from "@/lib/site";
import { Link } from "@/i18n/navigation";
import { Best, Cover, Cta, Drop, Gap, Story, Wait, almatyTime, dmy, type Pair, type Tr } from "./Slides";
import { ChekTools, CopyField, SlideFrame } from "./ChekTools";
import { packFor, type Pack, type TextCtx } from "./texts";
import "./chek.css";

type Props = { params: Promise<{ locale: string }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * «Чек дня» slides for the owner (DECISIONS.md, 2026-11-13 "Slide page"): today's digest drawn in the brand
 * templates, each slide downloadable as a PNG in the browser, with ready-to-paste texts per platform under it. Replaces the
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
  const c: TextCtx = { d, t, site: siteUrl(), campaign: issue.campaign, issue: issue.label, time: meta.time };
  const f = { hook: ui("fieldHook"), caption: ui("caption"), sticker: ui("fieldSticker"), linkRu: ui("fieldLinkRu"), linkKk: ui("fieldLinkKk"),
    post: ui("platPost"), reel: ui("platReel"), tiktok: ui("platTiktok"), story: ui("platStory") };
  const Sec = ({ title, slide, story, pack, storyOnly }: { title: string; slide?: React.ReactNode; story?: boolean; pack?: Pack | null; storyOnly?: boolean }) => (
    <section className="chek-sec">
      <h2>{title}</h2>
      <div className="chek-sec-body">
        {slide && <SlideFrame label={title} story={story}>{slide}</SlideFrame>}
        {pack && <div className="chek-texts">
          {!storyOnly && (["post", "reel", "tiktok"] as const).map((p, i) => (
            <details key={p} open={i === 0}>
              <summary>{f[p]}</summary>
              {p !== "post" && <CopyField title={f.hook} text={pack.hook} labels={copyLabels} />}
              <CopyField title={f.caption} text={pack.caption[p]} labels={copyLabels} />
            </details>
          ))}
          <details open={storyOnly}>
            <summary>{f.story}</summary>
            <CopyField title={f.sticker} text={pack.story.sticker} labels={copyLabels} />
            <CopyField title={f.linkRu} text={pack.story.linkRu} labels={copyLabels} />
            <CopyField title={f.linkKk} text={pack.story.linkKk} labels={copyLabels} />
          </details>
        </div>}
      </div>
    </section>
  );
  const copyLabels = { copy: ui("copy"), copied: ui("copied") };

  return (
    <main className="wrap admin chek">
      <p className="admin-now"><Link href="/admin">{ui("back")}</Link></p>
      <h1>{ui("pageTitle")} · {issue.label} · {dmy(d.date)}</h1>
      <p>{ui("pageLead")}</p>
      {!d.complete && <p className="paste-error" role="alert">{ui("notReady")}</p>}
      {!lead ? <p>{ui("empty")}</p> : (
        <ChekTools labels={{ download: ui("download"), downloadAll: ui("downloadAll"), saving: ui("saving"), saveFailed: ui("saveFailed"), fullView: ui("fullView"), fullViewAll: ui("fullViewAll"), phoneHint: ui("phoneHint") }}
          prefix={`chek-${issue.campaign.slice(5)}-${d.date}`}>
          <Sec title={ui("secDay")} slide={<Cover d={d} t={t} meta={meta} />} pack={packFor(c, "day")} />
          <Sec title={t.ru("best")} slide={<Best d={d} t={t} meta={meta} />} pack={packFor(c, "best")} />
          {d.drop && <Sec title={t.ru("drop")} slide={<Drop x={d.drop} t={t} meta={meta} />} pack={packFor(c, "drop")} />}
          {d.gap && <Sec title={t.ru("gap")} slide={<Gap x={d.gap} t={t} meta={meta} />} pack={packFor(c, "gap")} />}
          {d.wait && <Sec title={t.ru("wait")} slide={<Wait x={d.wait} t={t} meta={meta} />} pack={packFor(c, "wait")} />}
          {d.newLows.length > 0 && <Sec title={ui("secNewLows")} pack={packFor(c, "newLows")} />}
          <Sec title={ui("secCta")} slide={<Cta t={t} meta={meta} />} />
          <Sec title={ui("secStory")} slide={<Story d={d} t={t} meta={meta} verdict={verdict} />} story pack={packFor(c, "day")} storyOnly />
        </ChekTools>
      )}
    </main>
  );
}
