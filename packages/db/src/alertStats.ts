import type postgres from "postgres";

/**
 * Notification numbers, one definition for the Telegram report, /admin and /admin/business (docs/STATS.md, "KPI
 * definitions"). A target alert is a `target_reached` notification; one trigger (a tracking reaching its target in
 * one episode, key `tracking:episode`) sends one message per connected channel, so messages ≥ triggers ≥ products.
 * "Sent" means the provider accepted it (Telegram, or the email service); whether an email reached the inbox is not
 * reported to us. Every count is over notifications created in [from, to); no window = all time.
 */
export interface AlertStats {
  /** Distinct products with a sent target alert. */
  products: number;
  /** Distinct people (watchers) with a sent target alert. */
  people: number;
  /** Distinct target triggers (tracking × episode) with a sent message. */
  triggers: number;
  /** Target alert messages accepted by the provider. */
  targetMessages: number;
  /** Every notification message (target, first price, "Вы купили?"): accepted, failed, still waiting. */
  messages: { sent: number; failed: number; waiting: number };
  /** Messages whose link was opened, and the distinct products behind them. */
  clicks: number;
  clickedProducts: number;
}

export async function alertStats(sql: postgres.Sql, window?: { from: Date; to: Date }): Promise<AlertStats> {
  const w = window ? sql`and n.created_at >= ${window.from} and n.created_at < ${window.to}` : sql``;
  const [r] = await sql<AlertStats[]>`
    select
      count(distinct t.product_id) filter (where n.type = 'target_reached' and n.status = 'sent')::int as products,
      count(distinct t.watcher_id) filter (where n.type = 'target_reached' and n.status = 'sent')::int as people,
      count(distinct regexp_replace(n.idempotency_key, ':email$', '')) filter (where n.type = 'target_reached' and n.status = 'sent')::int as triggers,
      count(*) filter (where n.type = 'target_reached' and n.status = 'sent')::int as "targetMessages",
      json_build_object(
        'sent', count(*) filter (where n.status = 'sent'),
        'failed', count(*) filter (where n.status = 'failed'),
        'waiting', count(*) filter (where n.status in ('queued', 'sending'))) as messages,
      count(*) filter (where n.clicked_at is not null)::int as clicks,
      count(distinct t.product_id) filter (where n.clicked_at is not null)::int as "clickedProducts"
    from notifications n join trackings t on t.id = n.tracking_id
    where true ${w}`;
  return r!;
}
