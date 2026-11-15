import { formatTenge, shortTitle } from "@baga/core";
import type { BfRow } from "@baga/db";
import type { TelegramButton } from "./telegram";

/**
 * The Black Friday reminder (DECISIONS.md, 2026-11-15 "Black Friday reminder"): one Telegram message on the first sale
 * day to the chats that asked on /black-friday. Only what the page shows, from the same rows: how many store prices
 * fell for real against the two weeks before, how many are the same as before or dearer, the best real ones, and a
 * link. Observed prices only; no forecast, no promise.
 */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    title: "Чёрная пятница: первые итоги",
    counts: (real: number, same: number, dearer: number) => `Настоящая скидка: ${real} · цена как до распродажи: ${same} · дороже: ${dearer}`,
    none: "Пока ни одной настоящей скидки среди товаров, за которыми мы следим.",
    best: "Настоящие скидки:",
    kaspi: (n: number) => `Товаров, которые на Kaspi дешевле, чем в магазине: ${n}.`,
    note: "Сравниваем с самой низкой ценой того же магазина за 2 недели до распродажи. Только цены, которые мы сами видели.",
    open: "Все товары",
  },
  kk: {
    title: "Қара жұма: алғашқы қорытынды",
    counts: (real: number, same: number, dearer: number) => `Шынайы жеңілдік: ${real} · баға сатылымға дейінгідей: ${same} · қымбат: ${dearer}`,
    none: "Біз бақылайтын тауарлар арасында әзірге шынайы жеңілдік жоқ.",
    best: "Шынайы жеңілдіктер:",
    kaspi: (n: number) => `Kaspi-де дүкеннен арзан тауарлар: ${n}.`,
    note: "Сол дүкеннің сатылымға дейінгі 2 аптадағы ең төмен бағасымен салыстырамыз. Тек өзіміз көрген бағалар.",
    open: "Барлық тауарлар",
  },
} as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export function renderBfReminder(rows: BfRow[], locale: Locale, site: string): { html: string; buttons: TelegramButton[]; previewUrl: string | null } {
  const c = copy[locale];
  const f = (n: number) => formatTenge(n, locale);
  const checks = rows.flatMap((r) => r.stores.map((s) => ({ r, s })));
  const real = checks.filter((x) => x.s.check.kind === "real").sort((a, b) => (a.s.check.pct ?? 0) - (b.s.check.pct ?? 0));
  const same = checks.filter((x) => x.s.check.kind === "same").length;
  const dearer = checks.filter((x) => x.s.check.kind === "pricier").length;
  const kaspiCheaper = rows.filter((r) => { const p = r.stores.map((s) => s.now).filter((n): n is number => n !== null); return p.length > 0 && r.kaspiNow < Math.min(...p); }).length;
  const page = `${site}/${locale}/black-friday?utm_source=tg_bf&utm_medium=reminder`;
  const lines = [
    `🖤 <b>${esc(c.title)}</b>`,
    esc(c.counts(real.length, same, dearer)),
    "",
    ...(real.length
      ? [`<b>${esc(c.best)}</b>`, ...real.slice(0, 5).map(({ r, s }) =>
        `📉 <a href="${site}/${locale}/p/${r.externalId}?utm_source=tg_bf&utm_medium=reminder">${esc(shortTitle((locale === "kk" && r.titleKk) || r.title))}</a>\n${esc(s.name)}: <b>${f(s.check.during!.low)}</b> (${s.check.pct}% · ${locale === "kk" ? "бұрын" : "было"} ${f(s.check.before!.low)})`)]
      : [esc(c.none)]),
    "",
    esc(c.kaspi(kaspiCheaper)),
    "",
    `<i>${esc(c.note)}</i>`,
  ];
  return { html: lines.join("\n"), buttons: [{ text: `🧾 ${c.open}`, url: page }], previewUrl: null };
}
