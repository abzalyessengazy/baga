import type postgres from "postgres";

/** One-off Telegram reminders (migration 0031). The Black Friday results are the first topic. */
export const BF_TOPIC = "black_friday_2026";

/** Keeps a chat for a topic; true when it is new. */
export async function addReminder(sql: postgres.Sql, topic: string, chatId: string, locale: "ru" | "kk"): Promise<boolean> {
  const r = await sql`insert into reminders (topic, chat_id, locale) values (${topic}, ${chatId}, ${locale})
    on conflict (topic, chat_id) do update set locale = excluded.locale returning (xmax = 0) as fresh`;
  return !!r[0]?.fresh;
}

export async function dueReminders(sql: postgres.Sql, topic: string): Promise<{ id: number; chatId: string; locale: "ru" | "kk" }[]> {
  return sql`select id::int, chat_id as "chatId", locale from reminders where topic = ${topic} and sent_at is null order by id`;
}

/** Claimed before sending, so a second run never sends twice. */
export async function claimReminder(sql: postgres.Sql, id: number): Promise<boolean> {
  return (await sql`update reminders set sent_at = now() where id = ${id} and sent_at is null`).count > 0;
}

export async function dropReminders(sql: postgres.Sql, chatId: string): Promise<void> {
  await sql`delete from reminders where chat_id = ${chatId}`;
}

export async function countReminders(sql: postgres.Sql, topic: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from reminders where topic = ${topic}`;
  return r?.n ?? 0;
}
