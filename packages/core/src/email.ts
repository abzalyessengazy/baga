/**
 * The address a visitor typed, trimmed and lowercased, or null when it cannot be an email address. Deliberately
 * simple (one @, a dot in the domain, no spaces or angle brackets): the confirmation email is the real check.
 * ASCII only, so an address can never smuggle header characters or look-alike letters into the From/To lines.
 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (v.length < 6 || v.length > 254) return null;
  const m = /^([a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+)$/.exec(v);
  if (!m) return null;
  const [, local, domain] = m;
  if (local!.startsWith(".") || local!.endsWith(".") || local!.includes("..")) return null;
  if (domain!.split(".").some((l) => l.startsWith("-") || l.endsWith("-"))) return null;
  if (!/^[a-z]{2,}$/.test(domain!.split(".").pop()!)) return null;
  return v;
}
