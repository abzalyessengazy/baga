/**
 * Rebuilds whole cached pages of the site now: `pnpm --filter @baga/worker refresh-pages black-friday`. For
 * «Чёрная пятница» at 00:05 Almaty on the sale days (website audit 20 Nov 2026: the page is cached for a day and works out
 * «до / во время / после распродажи» when it renders, so on the morning of 27 Nov it could still say «до распродажи»
 * until the store run refreshed it). No Kaspi or store request, no database.
 */
import { refreshPages } from "./siteRefresh";
import { env } from "./env";

const pages = process.argv.slice(2).filter((a) => a === "black-friday" || a === "drops");
if (!pages.length) { console.log("usage: refresh-pages black-friday|drops"); process.exit(0); }
const n = await refreshPages(env.siteUrl(), env.telegramBotToken(), [], fetch, pages);
console.log(JSON.stringify({ refreshed: pages, productPages: n }));
