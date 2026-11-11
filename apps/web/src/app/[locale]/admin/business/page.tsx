import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatTenge, personReliable, share, targetMark, TARGETS, type TargetMark } from "@baga/core";
import { getSql, getBusiness, type BizDay, type BizTotals } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { adminEnabled, isAdmin } from "@/lib/admin";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ d?: string }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const PERIODS = [7, 30, 90] as const;
const count = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const pct = (r: number) => `${Math.round(r * 100)}%`;
const at = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const MARK: Record<TargetMark, string> = { on: "✓", half: "½", off: "✗" };
const OUTCOMES = ["ok", "queued", "not_a_url", "not_kaspi", "not_a_product", "short_link_failed", "check_failed", "rate_limited", "network", "unknown", "none"] as const;

/**
 * The owner's business dashboard (DECISIONS.md, 2026-11-11 "Business dashboard"). Visit-, person- and account-based
 * numbers kept apart (docs/STATS.md, "KPI definitions"): person numbers only for periods fully covered by browser ids,
 * never visits relabelled as people. Read-only; system health stays on /admin.
 */
export default async function BusinessPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { d } = await searchParams;
  setRequestLocale(locale);
  if (!adminEnabled()) notFound();
  const t = await getTranslations("biz");
  if (!(await isAdmin())) {
    return (
      <main className="wrap untracked">
        <p className="receipt admin-login">{t("signIn")} <Link href="/admin">{t("signInLink")}</Link></p>
      </main>
    );
  }
  const sql = getSql();
  if (!sql) notFound();
  const days = PERIODS.find((p) => String(p) === d) ?? 7;
  const b = await getBusiness(sql, days);
  // The targets are weekly numbers whatever the period shown.
  const w = days === 7 ? b : await getBusiness(sql, 7);
  // Visitors per day: people once 7 full days have browser ids, visits until then (and the row says which).
  const weekPeople = personReliable(w.from) && w.now.people !== null;
  const perDay = weekPeople ? w.now.people! / w.daily.length : w.daily.reduce((s, x) => s + x.visits, 0) / w.daily.length;
  const openRate = share(w.now.opened, w.now.visits);
  const connected = share(b.people.connected, b.people.watchers);
  const posts = share(b.now.fromPosts, b.now.visits);
  const targets: [string, string, string, TargetMark][] = [
    [weekPeople ? t("tPeoplePerDay") : t("tVisitsPerDay", { date: dm(b.personFrom) }), count(Math.round(perDay)), count(TARGETS.visitorsPerDay), targetMark(perDay, TARGETS.visitorsPerDay)],
    [t("tOpen"), pct(openRate), pct(TARGETS.productOpenRate), targetMark(openRate, TARGETS.productOpenRate)],
    [t("tAlerts"), count(b.alerts.trackings7d), count(TARGETS.alertsPerWeek), targetMark(b.alerts.trackings7d, TARGETS.alertsPerWeek)],
    [t("tConnected"), pct(connected), pct(TARGETS.connectedRate), targetMark(connected, TARGETS.connectedRate)],
    [t("tBought"), count(b.bought.yes), count(TARGETS.boughtYes), targetMark(b.bought.yes, TARGETS.boughtYes)],
    [t("tPosts"), pct(posts), pct(TARGETS.utmShare), targetMark(posts, TARGETS.utmShare)],
  ];
  const markLabel = (m: TargetMark) => t(m === "on" ? "markOn" : m === "half" ? "markHalf" : "markOff");
  const f = (n: number) => formatTenge(n, locale as "ru" | "kk");
  const kv = (rows: [string, number | string][]) => (
    <dl className="admin-kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === "number" ? count(v) : v}</dd></div>)}</dl>
  );
  const tile = (k: string, key: keyof BizTotals, ofVisits = false) => {
    const now = b.now[key], was = b.before?.[key] ?? null;
    const delta = now !== null && was ? Math.round(((now - was) / was) * 100) : null;
    return (
      <div key={k} className="biz-tile">
        <p className="biz-tile-k">{t(k as "kVisits")}</p>
        <p className="biz-tile-v">{now === null ? "—" : count(now)}{ofVisits && now !== null && b.now.visits > 0 && <small> · {pct(share(now, b.now.visits))}</small>}</p>
        <p className="biz-tile-d">
          {now === null ? t("noPeople", { date: dm(b.personFrom) }) : (
            <>
              {delta !== null && <span className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : undefined}>{delta > 0 ? "+" : ""}{delta}% · </span>}
              {was === null ? t("noBefore") : t("was", { n: count(was) })}
            </>
          )}
        </p>
      </div>
    );
  };
  const visitFunnel: [string, number][] = [
    [t("fVisits"), b.now.visits], [t("fOpened"), b.now.opened], [t("fPasted"), b.now.pasted], [t("fTracked"), b.now.tracked],
  ];
  const bar = (name: string, n: number, of: number) => {
    const r = share(n, of);
    return (
      <li key={name}>
        <span className="biz-funnel-k">{name}</span>
        <span className="biz-funnel-bar" aria-hidden><span style={{ width: `${Math.max(r * 100, n ? 1.5 : 0)}%` }} /></span>
        <span className="biz-funnel-v">{count(n)} · {pct(r)}</span>
      </li>
    );
  };
  const pasteRows = OUTCOMES.map((o) => [o, b.pastes.find((p) => p.outcome === o)?.n ?? 0] as const).filter(([, n]) => n > 0);
  const pasteTotal = pasteRows.reduce((s, [, n]) => s + n, 0);

  return (
    <main className="wrap untracked admin biz">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <p className="admin-now">{t("now", { time: at(new Date()) })} · <Link href="/admin">{t("health")}</Link></p>
      <nav className="biz-periods" aria-label={t("periodTitle", { n: days, from: dm(b.from), to: dm(b.to) })}>
        {PERIODS.map((p) => (
          <Link key={p} href={`/admin/business?d=${p}`} aria-current={p === days ? "page" : undefined} className="biz-period">{t("days", { n: p })}</Link>
        ))}
      </nav>
      <p className="biz-note">{t("kindsNote", { date: dm(b.personFrom) })}</p>
      {b.countedSince && b.countedSince > b.from && <p className="biz-note">{t("countedNote", { date: dm(b.countedSince) })}</p>}

      <section className="receipt admin-card">
        <h2>{t("targetsTitle", { date: dm(TARGETS.by) })}</h2>
        <div className="admin-scroll">
          <table className="admin-table biz-targets">
            <thead><tr><th scope="col" /><th scope="col">{t("colNow")}</th><th scope="col">{t("colTarget")}</th><th scope="col">{t("colMark")}</th></tr></thead>
            <tbody>
              {targets.map(([name, now, target, m]) => (
                <tr key={name}>
                  <th scope="row">{name}</th><td>{now}</td><td>{target}</td>
                  <td><span className={`biz-mark is-${m}`}><span aria-hidden>{MARK[m]}</span> {markLabel(m)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="biz-def">{t("targetsNote")}</p>
      </section>

      <section className="receipt admin-card">
        <h2>{t("periodTitle", { n: days, from: dm(b.from), to: dm(b.to) })}</h2>
        <h3>{t("gVisits")}</h3>
        <div className="biz-tiles">
          {tile("kVisits", "visits")}{tile("kOpened", "opened", true)}{tile("kPasted", "pasted", true)}{tile("kTracked", "tracked", true)}{tile("kFromPosts", "fromPosts", true)}
        </div>
        <h3>{t("gPeople")}</h3>
        <div className="biz-tiles">
          <div className="biz-tile is-main">
            <p className="biz-tile-k">{t("mapr")}</p>
            <p className="biz-tile-v">{b.mapr ? count(b.mapr.n) : "—"}</p>
            <p className="biz-tile-d">{b.mapr ? t("maprSince", { date: dm(b.mapr.since) }) : t("noPeople", { date: dm(b.personFrom) })}</p>
          </div>
          {tile("kPeople", "people")}{tile("kResearchers", "researchers")}{tile("kReturning", "returning")}
        </div>
        <h3>{t("gAccounts")}</h3>
        <div className="biz-tiles">
          {tile("kNewPeople", "newPeople")}{tile("kNewConnected", "newPeopleConnected")}{tile("kNewTrackings", "newTrackings")}
        </div>
        <p className="biz-def">{t("maprNote")} {t("kpiNote", { n: days })}</p>
      </section>

      <section className="receipt admin-card">
        <h2>{t("dailyTitle")}</h2>
        <div className="biz-charts">
          <Bars title={t("dVisits")} days={b.daily} pick={(x) => x.visits} />
          <Bars title={t("dOpened")} days={b.daily} pick={(x) => x.opened} />
          <Bars title={t("dTracked")} days={b.daily} pick={(x) => x.tracked} />
        </div>
        <details className="biz-details">
          <summary>{t("tableView")}</summary>
          <div className="admin-scroll">
            <table className="admin-table">
              <thead><tr><th>{t("colDay")}</th><th>{t("dVisits")}</th><th>{t("dOpened")}</th><th>{t("dTracked")}</th></tr></thead>
              <tbody>{b.daily.map((x) => <tr key={x.day}><td>{dm(x.day)}</td><td>{x.visits}</td><td>{x.opened}</td><td>{x.tracked}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="admin-grid">
        <section className="receipt admin-card">
          <h2>{t("funnelTitle")}</h2>
          <h3>{t("gVisits")}</h3>
          <ol className="biz-funnel">{visitFunnel.map(([name, n]) => bar(name, n, b.now.visits))}</ol>
          <h3>{t("gAccounts")}</h3>
          <ol className="biz-funnel">
            {bar(t("fNewPeople"), b.now.newPeople, b.now.newPeople)}
            {bar(t("fConnected"), b.now.newPeopleConnected, b.now.newPeople)}
          </ol>
          <p className="biz-def">{t("funnelNote")}</p>
        </section>

        <section className="receipt admin-card">
          <h2>{t("savingsTitle")}</h2>
          <div className="biz-tiles is-two">
            <div className="biz-tile is-main"><p className="biz-tile-k">{t("sConfirmed")}</p><p className="biz-tile-v">{f(b.savings.confirmed)}</p>
              <p className="biz-tile-d">{t("sConfirmedNote", { n: b.savings.confirmedCount })}</p></div>
            <div className="biz-tile"><p className="biz-tile-k">{t("sCaught")}</p><p className="biz-tile-v">{f(b.savings.caught)}</p>
              <p className="biz-tile-d">{t("sCaughtNote", { n: b.savings.caughtCount })}</p></div>
          </div>
          <p className="biz-def">{t("savingsNote")}</p>
        </section>
      </div>

      {b.savings.rows.length > 0 && (
        <section className="receipt admin-card">
          <div className="admin-scroll">
            <table className="admin-table">
              <thead><tr><th>{t("colProduct")}</th><th>{t("colStart")}</th><th>{t("colAlert")}</th><th>{t("colDiff")}</th><th>{t("colAnswer")}</th><th>{t("colDate")}</th></tr></thead>
              <tbody>
                {b.savings.rows.map((r) => (
                  <tr key={`${r.externalId}${r.at}`}>
                    <td className="biz-name"><Link href={`/p/${r.externalId}`}>{r.title}</Link></td>
                    <td>{f(r.start)}</td><td>{f(r.alert)}</td><td>−{f(r.start - r.alert)}</td>
                    <td>{t(r.bought === "yes" ? "ansYes" : r.bought === "later" ? "ansLater" : r.bought === "no" ? "ansNo" : "ansNone")}</td>
                    <td>{dm(r.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="receipt admin-card">
        <h2>{t("sourcesTitle")}</h2>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead><tr><th>{t("colSource")}</th><th>{t("colVisits")}</th><th>{t("colOpened")}</th><th>{t("colTracked")}</th></tr></thead>
            <tbody>
              {b.sources.map((s) => (
                <tr key={s.source} className={s.posts ? "is-post" : undefined}>
                  <td>{s.source === "direct" ? t("direct") : s.source}{s.posts && <span className="biz-chip">{t("post")}</span>}</td>
                  <td>{count(s.visits)}</td>
                  <td>{count(s.opened)} · {pct(share(s.opened, s.visits))}</td>
                  <td>{count(s.tracked)} · {pct(share(s.tracked, s.visits))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!b.sources.some((s) => s.posts) && <p className="biz-note">{t("noPosts")}</p>}
        <p className="biz-def">{t("sourcesNote")}</p>
      </section>

      <div className="admin-grid">
        <section className="receipt admin-card">
          <h2>{t("pastesTitle")}</h2>
          {pasteRows.length
            ? kv([...pasteRows.map(([o, n]): [string, string] => [t(`o_${o}` as "o_ok"), `${count(n)} · ${pct(share(n, pasteTotal))}`]),
              [t("linkFailures"), b.linkFailures]])
            : <p className="admin-muted">{t("noPastes")}</p>}
          <p className="biz-def">{t("pastesNote")}</p>
        </section>
        <section className="receipt admin-card">
          <h2>{t("alertsTitle")}</h2>
          {kv([[t("aProducts"), b.alerts.products], [t("aPeople"), b.alerts.people], [t("aTriggers"), b.alerts.triggers],
            [t("aTargetMessages"), b.alerts.targetMessages], [t("aSent"), b.alerts.messages.sent], [t("aFailed"), b.alerts.messages.failed],
            [t("aWaiting"), b.alerts.messages.waiting], [t("aClicks"), b.alerts.clicks], [t("aClickedProducts"), b.alerts.clickedProducts]])}
          <p className="biz-def">{t("alertsNote")}</p>
        </section>
        <section className="receipt admin-card">
          <h2>{t("boughtTitle")}</h2>
          {kv([[t("bAsked"), b.bought.asked], [t("bAnswered"), b.bought.yes + b.bought.later + b.bought.no], [t("bYes"), b.bought.yes], [t("bLater"), b.bought.later], [t("bNo"), b.bought.no]])}
        </section>
        <section className="receipt admin-card">
          <h2>{t("removedTitle")}</h2>
          {b.removed
            ? kv([[t("rBought"), b.removed.bought], [t("rElsewhere"), b.removed.bought_elsewhere], [t("rChanged"), b.removed.changed_mind],
              [t("rWaited"), b.removed.price_never_dropped], [t("rNone"), b.removed.none]])
            : <p className="admin-muted">{t("removedPending")}</p>}
        </section>
        <section className="receipt admin-card">
          <h2>{t("peopleTitle")}</h2>
          {kv([[t("pWatchers"), b.people.watchers], [t("pConnected"), b.people.connected], [t("pReturned"), b.people.returnedAfterADay]])}
        </section>
      </div>
    </main>
  );
}

/** One measure per day as bars from a zero baseline, the latest day inked; each bar's tooltip names day and value. */
function Bars({ title, days, pick }: { title: string; days: BizDay[]; pick: (d: BizDay) => number }) {
  const values = days.map(pick);
  const max = Math.max(1, ...values);
  const W = 300, H = 96, top = 14, base = H - 16;
  const step = W / days.length;
  const bw = Math.max(2, Math.min(18, step - 2));
  const last = values.length - 1;
  return (
    <figure className="biz-chart">
      <figcaption>{title} <b>{count(values[last] ?? 0)}</b></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${days.map((d, i) => `${dm(d.day)} ${values[i]}`).join(", ")}`}>
        <line x1="0" x2={W} y1={base} y2={base} className="biz-axis" />
        <text x="0" y="10" className="biz-tick">{count(max)}</text>
        {days.map((d, i) => {
          const h = values[i]! ? Math.max(2, ((base - top) * values[i]!) / max) : 0;
          const x = i * step + (step - bw) / 2;
          return (
            <g key={d.day} className={i === last ? "is-last" : undefined}>
              <rect x={i * step} y={top} width={step} height={base - top} className="biz-hit"><title>{`${dm(d.day)}: ${values[i]}`}</title></rect>
              {h > 0 && <rect x={x} y={base - h} width={bw} height={h} rx={Math.min(3, bw / 2)} className="biz-bar"><title>{`${dm(d.day)}: ${values[i]}`}</title></rect>}
            </g>
          );
        })}
        <text x="0" y={H - 3} className="biz-tick">{dm(days[0]!.day)}</text>
        <text x={W} y={H - 3} textAnchor="end" className="biz-tick">{dm(days[last]!.day)}</text>
      </svg>
    </figure>
  );
}
