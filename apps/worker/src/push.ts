import webpush from "web-push";
import { formatTenge, PUSH_PUBLIC_KEY } from "@baga/core";

type Locale = "ru" | "kk";

const copy = {
  ru: {
    first: "🧾 Проверили цену для вас",
    target: "🎯 Цена дошла до вашей!",
    now: (p: string) => `Сейчас на Kaspi: ${p}`,
    yours: (p: string) => `ваша цена ${p}`,
    noOffers: "Сейчас нет в продаже",
  },
  kk: {
    first: "🧾 Бағаны сіз үшін тексердік",
    target: "🎯 Баға сіздің бағаңызға жетті!",
    now: (p: string) => `Қазір Kaspi-де: ${p}`,
    yours: (p: string) => `сіздің бағаңыз ${p}`,
    noOffers: "Қазір сатылымда жоқ",
  },
};

export interface PushMessage { title: string; body: string; url: string; tag: string }

/**
 * A price alert as a browser notification (migration 0038): the same facts as the Telegram card, short, since a
 * notification shows two or three lines. A tap opens the product's page in BAĞA. `tag` replaces an older notification
 * about the same product instead of stacking them.
 */
export function renderPushAlert(p: {
  type: "first_price" | "target_reached"; locale: Locale; title: string; price: number | null; target: number | null; url: string; externalId: string;
}): PushMessage {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const name = p.title.length > 90 ? `${p.title.slice(0, 89)}…` : p.title;
  const now = p.price !== null ? c.now(f(p.price)) : c.noOffers;
  const line = p.target !== null ? `${now} · ${c.yours(f(p.target))}` : now;
  return { title: p.type === "first_price" ? c.first : c.target, body: `${name}\n${line}`, url: p.url, tag: `baga-${p.externalId}` };
}

/** One browser's answer: delivered, or gone for good (permission withdrawn, data cleared: 404/410). Anything else throws. */
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage, privateKey: string, subject: string): Promise<"ok" | "gone"> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(msg), {
      vapidDetails: { subject, publicKey: PUSH_PUBLIC_KEY, privateKey },
      TTL: 24 * 3600, urgency: "high", timeout: 10_000,
    });
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    throw new Error(`push ${status ?? ""} ${(e as Error).message}`.trim());
  }
}
