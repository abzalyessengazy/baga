"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { cachedStats, loadStats, type Stats } from "@/lib/market";

/** The tape's short name: the first three words of the title, 26 characters at most, beside the product's picture (the owner, 14 Nov). */
function tapeName(title: string): string {
  // A third word that is only a number is a size cut off from its unit («… 165 см»): two words say it better.
  const first = title.split(/\s+/).slice(0, 3);
  if (first.length === 3 && /^[\d.,]+$/.test(first[2]!)) first.pop();
  const words = first.join(" ").replace(/[\s,/(\-–]+$/, "");
  return words.length > 26 ? `${words.slice(0, 25).trimEnd()}…` : words;
}

/**
 * A receipt tape that keeps moving under the hero: the day's biggest moves in tenge, real ones from /api/stats. It
 * pauses under the pointer or a finger, and stands still (scrollable by hand) with reduced motion. Hidden until
 * there are at least four moves, so the tape never loops on one item.
 */
export function Ticker() {
  const t = useTranslations("home");
  const locale = useLocale() as "ru" | "kk";
  const [s, setS] = useState<Stats | null>(() => cachedStats() ?? null);
  useEffect(() => {
    let live = true;
    loadStats().then((j) => { if (live) setS(j); });
    return () => { live = false; };
  }, []);
  const drops = s?.tenge?.drops ?? [], rises = s?.tenge?.rises ?? [];
  // Two drops to one rise: the tape is mostly good news, and never hides that prices also go up.
  const items: (typeof drops[number] & { up: boolean })[] = [];
  for (let i = 0, r = 0; i < drops.length; i++) {
    items.push({ ...drops[i]!, up: false });
    if (i % 2 === 1 && rises[r]) items.push({ ...rises[r++]!, up: true });
  }
  if (items.length < 4) return null;
  const run = (hidden: boolean) => (
    <ul className="ticker-run" aria-hidden={hidden || undefined}>
      {items.map((d) => (
        <li key={d.externalId}>
          <Link href={`/p/${d.externalId}`} tabIndex={hidden ? -1 : undefined} className={d.up ? "is-up" : "is-down"}>
            <b><span className="ticker-arrow" aria-hidden>{d.up ? "↑" : "↓"}</span> {formatTenge(Math.abs(d.to - d.from), locale)}</b>
            {d.imageUrl ? <img className="ticker-thumb" src={d.imageUrl} alt="" width={22} height={22} loading="lazy" /> : <span className="ticker-thumb" aria-hidden />}
            <span>{tapeName(shortTitle((locale === "kk" && d.titleKk) || d.title))}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="ticker" aria-label={t("tickerLabel")} style={{ "--ticker-s": `${items.length * 4}s` } as React.CSSProperties}>
      <span className="ticker-tag">{t("tickerTag")}</span>
      <div className="ticker-track">{run(false)}{run(true)}</div>
    </section>
  );
}
