/** The "dates" translator, loosely typed: the month keys are built at runtime. */
export type DatesT = (key: string, values?: Record<string, string | number>) => string;

/**
 * "5 ноя" / "5 қар": a day as visitors read it (Almaty time). Takes an ISO timestamp or a "YYYY-MM-DD" day. Month
 * names come from messages (`dates`), because browsers often have no Kazakh month names (5 Nov 2026: "M11 4").
 */
export function dayMonth(value: string, t: DatesT, inSentence = false): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date(new Date(value).getTime() + 5 * 3_600_000).toISOString().slice(0, 10); // Almaty is UTC+5
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  // Inside a sentence the full month in its case: "4 қарашада" / "4 ноября".
  return inSentence ? t("dayIn", { d, month: t(`in${m}`) }) : t("day", { d, month: t(`m${m}`) });
}
