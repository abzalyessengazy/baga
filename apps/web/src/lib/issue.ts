/** «Чек дня» issues are numbered from № 001 on 13 Nov 2026 (Almaty), one a day (the owner's playbook). */
const FIRST_ISSUE = Date.UTC(2026, 10, 13);

export function issueOf(almatyDate: string): { number: number; label: string; campaign: string } {
  const n = Math.max(1, Math.round((Date.parse(`${almatyDate}T00:00:00Z`) - FIRST_ISSUE) / 86_400_000) + 1);
  const nnn = String(n).padStart(3, "0");
  return { number: n, label: `№ ${nnn}`, campaign: `chek_${nnn}` };
}
