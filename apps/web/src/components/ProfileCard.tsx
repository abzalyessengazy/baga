"use client";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { useRouter } from "@/i18n/navigation";
import { openQuiz, PROFILE_EVENT, type MyProfile } from "@/lib/profileClient";
import { dayMonth, type DatesT } from "@/lib/dayMonth";
import { Avatar } from "./Avatar";
import { CountUp } from "./Motion";

type Props = { profile: NonNullable<MyProfile["profile"]>; stats: NonNullable<MyProfile["stats"]>; level: NonNullable<MyProfile["level"]>; hasChannel: boolean };

/**
 * The top of «Мои товары» as a profile (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"): the
 * avatar and nickname, since when, the level with what the next one needs, four sums of the visitor's own trackings
 * and the place on the board with the gap to the next place. All from observed prices; «сэкономил» only from
 * purchases the visitor confirmed.
 */
export function ProfileCard({ profile, stats, level, hasChannel }: Props) {
  const t = useTranslations("profile");
  const td = useTranslations("dates") as unknown as DatesT;
  const locale = useLocale() as "ru" | "kk";
  const router = useRouter();
  const reduce = useReducedMotion();
  const [onBoard, setOnBoard] = useState(profile.onBoard);
  const [digest, setDigest] = useState(profile.digest);
  useEffect(() => {
    const on = () => router.refresh();
    window.addEventListener(PROFILE_EVENT, on);
    return () => window.removeEventListener(PROFILE_EVENT, on);
  }, [router]);
  const f = (n: number) => formatTenge(n, locale);
  const n = (v: number) => String(v);
  const flag = async (body: { onBoard?: boolean; digest?: boolean }) => {
    const res = await fetch("/api/my/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) router.refresh();
    return !!res?.ok;
  };
  const has = !!profile.profileAt;
  const since = new Date(profile.since);
  const sinceText = `${dayMonth(profile.since, td)} ${since.getFullYear()}`;
  const tiles: [string, number, (v: number) => string, string?][] = [
    [t("tracked"), stats.tracked, n],
    [t("total"), stats.total, f],
    [t("want"), stats.potential, f, "is-want"],
    [t("saved"), stats.saved, f, "is-saved"],
  ];
  return (
    <section className="receipt profile" aria-label={t("title")}>
      <div className="profile-head">
        <Avatar id={profile.avatar} size={64} live />
        <div className="profile-id">
          <h2 className="profile-name">{profile.nickname ?? t("noName")}</h2>
          <p className="profile-since">{t("since", { date: sinceText })}</p>
        </div>
        <button type="button" className={has ? "link-btn" : "btn btn-stamp"} onClick={openQuiz}>{has ? t("edit") : t("create")}</button>
      </div>
      {!has && <p className="profile-pitch">{t("pitch")}</p>}
      <div className="profile-level">
        <div className="profile-level-line">
          <span className="stamp profile-level-stamp">{t(`level.${level.id}`)}</span>
          <span className="profile-next">{level.next ? t("next", { need: level.next.need, level: t(`level.${level.next.id}`) }) : t("top")}</span>
        </div>
        <div className="meter profile-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress * 100)}>
          <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.max(4, Math.round(level.progress * 100))}%` }} transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: 0.2 }} />
        </div>
      </div>
      <dl className="profile-tiles">
        {tiles.map(([k, v, fmt, cls], i) => (
          <motion.div key={k} className={cls} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }}>
            <dt>{k}</dt>
            <dd><CountUp value={v} format={fmt} /></dd>
          </motion.div>
        ))}
      </dl>
      <p className="note profile-how">{t("how")}</p>
      <hr className="rule" />
      <div className="profile-rank">
        {stats.rank !== null ? (
          <>
            <p className="profile-rank-line"><b>{t("rank", { rank: stats.rank, total: stats.boardSize })}</b></p>
            <p className="profile-hint">{stats.ahead ? t("ahead", { gap: f(stats.ahead.gap), rank: stats.ahead.rank }) : t("first")}</p>
          </>
        ) : <p className="profile-hint">{onBoard ? t("noRank") : t("hidden")}</p>}
      </div>
      <div className="profile-flags">
        <label><input type="checkbox" checked={onBoard} onChange={async (e) => { const v = e.target.checked; setOnBoard(v); if (!(await flag({ onBoard: v }))) setOnBoard(!v); }} /> {t("flagBoard")}</label>
        <label><input type="checkbox" checked={digest} onChange={async (e) => { const v = e.target.checked; setDigest(v); if (!(await flag({ digest: v }))) setDigest(!v); }} /> {t("flagDigest")}</label>
        {digest && !hasChannel && <p className="note">{t("digestNeedsChannel")}</p>}
      </div>
    </section>
  );
}
