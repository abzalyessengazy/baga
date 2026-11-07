import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSql, getAdminHealth, getFunnel, recentFeedback, pendingMatches, latestStoreRuns, type AdminRun, RUN_PACE_WARN_S } from "@baga/db";
import { isInVisitWindow } from "@baga/core";
import { adminEnabled, isAdmin } from "@/lib/admin";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ e?: string }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// A run without finished_at is still going while its checks keep coming; otherwise it was cancelled or killed.
const LIVE_MS = 20 * 60_000;
const count = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const share = (n: number, of: number) => (of ? `${count(n)} · ${Math.round((n / of) * 100)}%` : "—");
const at = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) : "—";

/** The owner's health page (DECISIONS.md, 2026-11-03 "Admin page"): read-only numbers straight from the database. */
export default async function AdminPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { e } = await searchParams;
  setRequestLocale(locale);
  if (!adminEnabled()) notFound();
  const t = await getTranslations("admin");
  if (!(await isAdmin())) {
    return (
      <main className="wrap untracked">
        <form className="receipt admin-login" method="post" action="/api/admin">
          <label htmlFor="admin-token">{t("token")}</label>
          <input id="admin-token" name="token" type="password" autoComplete="current-password" required />
          <input type="hidden" name="l" value={locale} />
          {(e === "wrong" || e === "limit") && <p className="paste-error" role="alert">{t(e === "wrong" ? "wrongKey" : "tooMany")}</p>}
          <button type="submit" className="btn">{t("signIn")}</button>
        </form>
      </main>
    );
  }
  const sql = getSql();
  if (!sql) notFound();
  const [h, feedback, funnel, pending, storeRuns] = await Promise.all([getAdminHealth(sql), recentFeedback(sql), getFunnel(sql, 7).catch(() => null),
    // Before migration 0018 the store tables do not exist.
    pendingMatches(sql).catch(() => []), latestStoreRuns(sql).catch(() => [])]);
  const now = Date.now();
  const state = (r: AdminRun) =>
    r.aborted ? t("runAborted", { reason: r.aborted })
    : r.finishedAt ? t("runDone")
    : r.lastCheckAt && now - r.lastCheckAt.getTime() < LIVE_MS ? t("runLive")
    : t("runStopped");
  const lastCheck = h.runs.find((r) => r.lastCheckAt)?.lastCheckAt ?? null;
  const failedAlerts = h.notifications.filter((n) => n.status === "failed").reduce((s, n) => s + n.n, 0);
  const warnings = [
    ...(isInVisitWindow(new Date(), 15 * 60_000) && (!lastCheck || now - lastCheck.getTime() > LIVE_MS) ? [t("warnNoRun")] : []),
    ...(h.schedule.due > 50 ? [t("warnDue", { n: h.schedule.due })] : []),
    // A slow run loses checks: something between requests takes too long (6 Nov 2026).
    ...(h.runs.find((r) => r.pace !== null && (r.requests ?? 0) >= 100)?.pace! > RUN_PACE_WARN_S
      ? [t("warnPace", { pace: h.runs.find((r) => r.pace !== null && (r.requests ?? 0) >= 100)!.pace!, max: RUN_PACE_WARN_S })] : []),
    ...(failedAlerts ? [t("warnAlerts", { n: failedAlerts })] : []),
    ...(h.people.noneWithTrackings ? [t("warnNoChannel", { n: h.people.noneWithTrackings })] : []),
    ...(h.errors.length ? [t("warnErrors", { n: h.errors.reduce((s, e) => s + e.n, 0) })] : []),
  ];
  const kv = (rows: [string, number | string][]) => (
    <dl className="admin-kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === "number" ? count(v) : v}</dd></div>)}</dl>
  );
  return (
    <main className="wrap untracked admin">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <p className="admin-now">{t("now", { time: at(new Date()) })}</p>

      <section className={`receipt admin-card${warnings.length ? " is-warn" : ""}`}>
        <h2>{warnings.length ? t("warnings") : t("allGood")}</h2>
        {warnings.length > 0 && <ul className="admin-list">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </section>

      <div className="admin-grid">
        <section className="receipt admin-card">
          <h2>{t("collector")}</h2>
          {kv([[t("lastCheck"), at(lastCheck)], [t("checksToday"), h.checksToday], [t("scheduled"), h.schedule.total],
            [t("due"), h.schedule.due], [t("failing"), h.schedule.failing]])}
        </section>
        <section className="receipt admin-card">
          <h2>{t("people")}</h2>
          {kv([[t("watchers"), h.people.watchers], [t("new24h"), h.people.new24h], [t("new7d"), h.people.new7d],
            [t("telegram"), h.people.telegram], [t("emailConfirmed"), h.people.emailConfirmed], [t("emailPending"), h.people.emailPending],
            [t("both"), h.people.both], [t("none"), h.people.none]])}
        </section>
        <section className="receipt admin-card">
          <h2>{t("trackings")}</h2>
          {kv([[t("total"), h.trackings.total], [t("active"), h.trackings.active], [t("trackedProducts"), h.trackings.products],
            [t("byPreset"), h.trackings.byPreset], [t("pctWaiting"), h.trackings.pctWaiting], [t("waiting"), h.trackings.waiting]])}
          <h3>{t("perWatcher")}</h3>
          {kv(h.perWatcher.map((p) => [t("perWatcherRow", { n: p.trackings }), p.watchers]))}
        </section>
        <section className="receipt admin-card">
          <h2>{t("catalog")}</h2>
          {kv([[t("products"), h.catalog.products], [t("seeded"), h.catalog.seeded], [t("withPrice"), h.catalog.withPrice],
            [t("inStock"), h.catalog.inStock], [t("viewed24h"), h.catalog.viewed24h]])}
          <h3>{t("queues")}</h3>
          {h.seedQueue.length + h.shortLinks.length ? kv([...h.seedQueue, ...h.shortLinks].map((q) => [q.label, q.n])) : <p className="admin-muted">{t("empty")}</p>}
        </section>
      </div>

      {funnel && (
        <section className="receipt admin-card">
          <h2>{t("funnel", { days: funnel.days })}</h2>
          <p className="admin-muted">{t("funnelNote")}</p>
          <div className="admin-scroll">
            <table className="admin-table">
              <tbody>
                {funnel.steps.map((s) => {
                  const visits = funnel.steps[0]!.sessions;
                  const label = { visit: "stepVisit", paste: "stepPaste", product_view: "stepProductView", track: "stepTrack", channel: "stepChannel" }[s.name];
                  return (
                    <tr key={s.name}>
                      <td>{t(label as "stepVisit")}</td><td>{count(s.sessions)}</td>
                      <td>{visits ? `${Math.round((s.sessions / visits) * 100)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="admin-grid">
            <div><h3>{t("byLocale")}</h3>{kv(funnel.byLocale.map((r) => [r.label, r.n]))}</div>
            <div><h3>{t("byDevice")}</h3>{kv(funnel.byDevice.map((r) => [r.label, r.n]))}</div>
            <div><h3>{t("sources")}</h3>{kv(funnel.sources.map((r) => [r.label, r.n]))}</div>
            <div>
              <h3>{t("boughtTitle")}</h3>
              {kv([[t("boughtAsked"), funnel.asked],
                ...(["yes", "later", "no"] as const).map((a): [string, number] =>
                  [t(a === "yes" ? "boughtYes" : a === "later" ? "boughtLater" : "boughtNo"), funnel.bought.find((b) => b.answer === a)?.n ?? 0]),
                [t("returned"), funnel.returned]])}
            </div>
            <div>
              <h3>{t("hitTitle")}</h3>
              {kv([[t("hitViews"), funnel.views.total],
                [t("hitPriced"), share(funnel.views.priced, funnel.views.total)],
                [t("hitWeek"), share(funnel.views.week, funnel.views.total)]])}
            </div>
          </div>
        </section>
      )}

      <section className="receipt admin-card">
        <h2>{t("runs")}</h2>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead><tr><th>#</th><th>{t("started")}</th><th>{t("lastCheck")}</th><th>{t("requests")}</th><th>{t("pace")}</th><th>{t("checks")}</th><th>{t("failed")}</th><th>{t("state")}</th></tr></thead>
            <tbody>
              {h.runs.map((r) => (
                <tr key={r.id}><td>{r.id}</td><td>{at(r.startedAt)}</td><td>{at(r.lastCheckAt)}</td><td>{r.requests === null ? "—" : count(r.requests)}</td><td className={r.pace !== null && r.pace > RUN_PACE_WARN_S ? "is-warn" : undefined}>{r.pace === null ? "—" : `${r.pace} с`}</td><td>{count(r.checks)}</td><td>{count(r.failed)}</td><td>{state(r)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="receipt admin-card">
        <h2>{t("alerts")}</h2>
        {h.notifications.length === 0 ? <p className="admin-muted">{t("empty")}</p> : (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead><tr><th>{t("channel")}</th><th>{t("type")}</th><th>{t("status")}</th><th>{t("n")}</th><th>{t("clicked")}</th><th>{t("last")}</th></tr></thead>
              <tbody>
                {h.notifications.map((n) => (
                  <tr key={`${n.channel}${n.type}${n.status}`} className={n.status === "sent" ? "" : "is-bad"}>
                    <td>{n.channel}</td><td>{n.type}</td><td>{n.status}</td><td>{count(n.n)}</td><td>{count(n.clicked)}</td><td>{at(n.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="receipt admin-card">
        <h2>{t("feedback")}</h2>
        {feedback.length === 0 ? <p className="admin-muted">{t("empty")}</p> : (
          <ul className="admin-list">
            {feedback.map((f) => (
              <li key={f.id}>
                <strong>{at(f.createdAt)}</strong>
                {f.externalId && <> · <a href={`/${locale}/p/${f.externalId}`}>{f.title ?? f.externalId}</a></>}
                <br /><span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{f.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Other stores (DECISIONS.md, 2026-11-07): the latest runs, and pairs the matcher was unsure of. */}
      <section className="receipt admin-card">
        <h2>{t("storesTitle")}</h2>
        {storeRuns.length === 0 ? <p className="admin-muted">{t("empty")}</p> : (
          <ul className="admin-list">
            {storeRuns.map((r) => (
              <li key={r.startedAt.toISOString()}>{r.store} · {at(r.startedAt)} · {t("storesRun", { requests: r.requests, priced: r.priced, matched: r.matched, failed: r.failed })}
                {r.aborted && <> · <strong>{r.aborted}</strong></>}</li>
            ))}
          </ul>
        )}
        <h3>{t("matchPending", { n: pending.length })}</h3>
        {pending.length === 0 ? <p className="admin-muted">{t("empty")}</p> : (
          <ul className="admin-list">
            {pending.map((m) => (
              <li key={m.id}>
                <a href={`/${locale}/p/${m.externalId}`}>{m.ourTitle}</a>{m.kaspiPrice !== null && ` · ${count(m.kaspiPrice)} ₸`}<br />
                ↔ <a href={m.url} target="_blank" rel="noopener noreferrer">{m.storeTitle ?? m.url}</a>{m.reason && <> · <code>{m.reason}</code></>}
                <form method="post" action="/api/admin/match" className="admin-match">
                  <input type="hidden" name="id" value={m.id} /><input type="hidden" name="l" value={locale} />
                  <button type="submit" name="d" value="yes" className="btn">{t("matchConfirm")}</button>
                  <button type="submit" name="d" value="no" className="btn btn-ghost">{t("matchReject")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="receipt admin-card">
        <h2>{t("errors")}</h2>
        {h.errors.length === 0 ? <p className="admin-muted">{t("empty")}</p> : (
          <ul className="admin-list">
            {h.errors.map((e) => <li key={`${e.where}${e.error}`}><strong>{e.where} ×{e.n}</strong> {at(e.last)}<br /><code>{e.error}</code></li>)}
          </ul>
        )}
      </section>
    </main>
  );
}
