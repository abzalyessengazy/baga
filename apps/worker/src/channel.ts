import { formatTenge, shortTitle } from "@baga/core";
import type { Mover } from "@baga/db";
import type { TelegramButton } from "./telegram";

/**
 * The daily post in BAĞA's public Telegram channel (DECISIONS.md, 2026-11-03 "Sale check, week movers, channel"):
 * the week's biggest drops by our own checks, sent once at the end of the day's collection run. Links carry
 * utm_source=tg_channel so the funnel shows what the channel brings.
 */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    title: "Подешевели за неделю",
    sale: (name: string) => `Идёт ${name}: это цены во время акции.`,
    note: "Только цены, которые мы сами видели на Kaspi.kz. Перед покупкой проверьте цену на Kaspi.",
    all: "Все изменения цен",
    sales: { kaspiJuma202611: "Kaspi Жұма", singlesDay2026: "распродажа 11.11" } as Record<string, string>,
  },
  kk: {
    title: "Бір аптада арзандағандар",
    sale: (name: string) => `${name} жүріп жатыр: бұл акция кезіндегі бағалар.`,
    note: "Тек Kaspi.kz-те өзіміз көрген бағалар. Сатып алар алдында Kaspi-дегі бағаны тексеріңіз.",
    all: "Барлық баға өзгерістері",
    sales: { kaspiJuma202611: "Kaspi Жұма", singlesDay2026: "11.11 жәрмеңкесі" } as Record<string, string>,
  },
} as const;

const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);

export function renderChannelPost(p: { locale: Locale; movers: Mover[]; site: string; day: string; saleId: string | null }): { html: string; buttons: TelegramButton[] } {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const link = (path: string) => `${p.site}/${p.locale}${path}?utm_source=tg_channel`;
  const [, mm, dd] = p.day.split("-");
  const saleName = p.saleId ? c.sales[p.saleId] : undefined;
  const html = [
    `📉 <b>${c.title}</b> · ${dd}.${mm}`,
    ...(saleName ? [`🛍 ${esc(c.sale(saleName))}`] : []),
    "",
    ...p.movers.flatMap((m, i) => [
      `${i + 1}. <a href="${link(`/p/${m.externalId}`)}">${esc(shortTitle((p.locale === "kk" && m.titleKk) || m.title))}</a>`,
      `<s>${f(m.was)}</s> → <b>${f(m.now)}</b> · −${Math.abs(m.pct)}%`,
      "",
    ]),
    `<i>${c.note}</i>`,
  ].join("\n");
  return { html, buttons: [{ text: c.all, url: link("/drops") }] };
}
