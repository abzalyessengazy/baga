"use client";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { loadBoard, type BoardRow } from "@/lib/market";
import { loadMyProfile, openQuiz, PROFILE_EVENT, type MyProfile } from "@/lib/profileClient";
import { Avatar } from "./Avatar";
import { CountUp, useReplay } from "./Motion";

/**
 * The home page leaderboard (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"): the ten visitors
 * who want to save the most, by the sums of their own trackings at observed prices. Nicknames and stock avatars
 * only. Ranked by «хочет сэкономить» for now; «сэкономил» (confirmed purchases) is shown beside it and will rank
 * once there is enough of it. Real rows only: with nobody tracking, an invitation instead of sample names.
 */
export function Leaderboard() {
  const locale = useLocale() as "ru" | "kk";
  const [b, setB] = useState<{ rows: BoardRow[]; total: number } | null>(null);
  const [me, setMe] = useState<MyProfile | null>(null);
  const load = useCallback((fresh: boolean) => {
    // After saving a profile the CDN copy is up to a minute old: ask past it once.
    (fresh ? fetch(`/api/board?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : loadBoard()).then((x) => x && setB(x));
    loadMyProfile().then(setMe);
  }, []);
  useEffect(() => {
    load(false);
    const on = () => load(true);
    window.addEventListener(PROFILE_EVENT, on);
    return () => window.removeEventListener(PROFILE_EVENT, on);
  }, [load]);
  if (!b) return null;
  return <Board b={b} me={me} locale={locale} />;
}

/** Mounted once the rows are here, so the "on screen" watcher has its element from the first frame. */
function Board({ b, me, locale }: { b: { rows: BoardRow[]; total: number }; me: MyProfile | null; locale: "ru" | "kk" }) {
  const t = useTranslations("board");
  const ref = useRef<HTMLDivElement>(null);
  const go = useReplay(ref, 0.15);
  const f = (n: number) => formatTenge(n, locale);
  const max = Math.max(1, ...b.rows.map((r) => r.potential));
  const myTag = me?.stats?.tag ?? null;
  const hasProfile = !!me?.profile?.profileAt;
  const mine = me?.stats && me.stats.rank !== null && me.stats.rank > b.rows.length
    ? { tag: me.stats.tag!, rank: me.stats.rank, nickname: me.profile?.nickname ?? null, avatar: me.profile?.avatar ?? null, tracked: me.stats.tracked, total: me.stats.total, potential: me.stats.potential, saved: me.stats.saved }
    : null;
  const row = (r: BoardRow, i: number) => {
    const you = r.tag === myTag;
    return (
      <motion.li key={r.tag} className={`lb-row${you ? " is-you" : ""}${r.rank <= 3 ? ` is-top is-top-${r.rank}` : ""}`}
        initial={false} animate={go ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={go ? { type: "spring", stiffness: 300, damping: 28, delay: i * 0.07 } : { duration: 0 }}>
        <span className="lb-rank">{r.rank}</span>
        <Avatar id={r.avatar} size={40} live={r.rank === 1} />
        <span className="lb-who">
          <span className="lb-name">{r.nickname ?? t("anon", { tag: r.tag.slice(0, 4).toUpperCase() })}{you && <span className="lb-you">{t("you")}</span>}</span>
          <span className="lb-sub">{t("sub", { count: r.tracked, total: f(r.total) })}{r.saved > 0 && <> · {t("subSaved", { saved: f(r.saved) })}</>}</span>
        </span>
        <span className="lb-num lb-tracked"><b>{r.tracked}</b><small>{t("colTracked")}</small></span>
        <span className="lb-num lb-total"><b>{f(r.total)}</b><small>{t("colTotal")}</small></span>
        <span className="lb-num lb-saved"><b>{r.saved > 0 ? f(r.saved) : "—"}</b><small>{t("colSaved")}</small></span>
        <span className="lb-num lb-want"><b>{go ? <CountUp value={r.potential} format={f} /> : f(r.potential)}</b><small>{t("colWant")}</small></span>
        {/* A smooth bar on a light track (the owner, 14 Nov: no dots); the leader's runs full width. */}
        <span className="lb-track" aria-hidden>
          <motion.span className="lb-bar" initial={false} animate={{ width: go ? `${Math.max(3, (r.potential / max) * 100)}%` : "0%" }}
            transition={go ? { duration: 0.9, delay: 0.2 + i * 0.07, ease: [0.23, 1, 0.32, 1] } : { duration: 0 }} />
        </span>
      </motion.li>
    );
  };
  return (
    <section className="wrap section lb-section">
      <h2 className="section-title">{t("title")}</h2>
      <p className="section-note">{t("lead")}</p>
      <div className="receipt lb" ref={ref}>
        {b.rows.length === 0 ? <p className="lb-empty">{t("empty")}</p> : (
          <ol className="lb-list">
            {b.rows.map(row)}
            {mine && <li className="lb-gap" aria-hidden>···</li>}
            {mine && row(mine, b.rows.length)}
          </ol>
        )}
        <hr className="rule" />
        <div className="lb-foot">
          <p className="note">{t("rule", { total: b.total })}</p>
          {hasProfile
            ? <Link href="/my" className="btn btn-stamp">{t("toProfile")}</Link>
            : <button type="button" className="btn btn-stamp lb-join" onClick={openQuiz}>{t("join")}</button>}
        </div>
      </div>
    </section>
  );
}
