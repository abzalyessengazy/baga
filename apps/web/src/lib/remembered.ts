/**
 * A JSON endpoint of the home page, loaded once and kept while the visitor moves around the site (client navigation
 * keeps this module). Back on the home page the lists are drawn at once, at full height, so the browser can return
 * to the same spot (the owner, 12 Nov). Reloaded when older than `maxAgeMs`; a failed reload keeps the last answer.
 */
export function remembered<T>(url: string, maxAgeMs = 5 * 60_000) {
  let pending: Promise<T | null> | null = null;
  let at = 0;
  let value: T | null | undefined;
  return {
    /** The last answer, or undefined before the first one arrived. */
    peek: (): T | null | undefined => value,
    load: (): Promise<T | null> => {
      if (!pending || Date.now() - at > maxAgeMs) {
        at = Date.now();
        pending = fetch(url)
          .then((r) => (r.ok ? (r.json() as Promise<T | null>) : null))
          .catch(() => null)
          .then((v) => {
            if (v !== null || value === undefined) value = v;
            return value ?? null;
          });
      }
      return pending;
    },
  };
}
