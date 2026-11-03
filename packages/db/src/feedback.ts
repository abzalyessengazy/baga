import type postgres from "postgres";

/** The feedback button (table from migration 0001): anonymous text, optionally tied to the product page it came from. */
export const FEEDBACK_MAX = 2000;

export async function addFeedback(sql: postgres.Sql, kind: string, text: string, externalId: string | null): Promise<void> {
  await sql`insert into feedback (kind, text, product_id)
    values (${kind}, ${text.slice(0, FEEDBACK_MAX)},
      (select id from products where external_id = ${externalId} and ${externalId}::text is not null limit 1))`;
}

export interface FeedbackRow { id: number; kind: string; text: string | null; externalId: string | null; title: string | null; createdAt: Date }

export async function recentFeedback(sql: postgres.Sql, limit = 30): Promise<FeedbackRow[]> {
  return sql<FeedbackRow[]>`
    select f.id::int as id, f.kind, f.text, p.external_id as "externalId", p.title, f.created_at as "createdAt"
    from feedback f left join products p on p.id = f.product_id
    order by f.created_at desc limit ${limit}`;
}
