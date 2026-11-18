/*
 * BAĞA's service worker: browser notifications only (DECISIONS.md 2026-11-18 "Browser notifications"). It caches
 * nothing and touches no request. A push carries { title, body, url, tag } (apps/worker/src/push.ts); a tap opens
 * the product's page on this site, never another one.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || "BAĞA", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "/apple-icon", lang: "ru",
    data: { url: typeof d.url === "string" ? d.url : "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const to = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  if (to.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) if (c.url === to.href && "focus" in c) return c.focus();
    return self.clients.openWindow(to.href);
  })());
});

// The browser renewed the subscription by itself (Firefox does): save the new one for the same person.
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    const sub = e.newSubscription || (await self.registration.pushManager.subscribe(e.oldSubscription ? e.oldSubscription.options : { userVisibleOnly: true }));
    await fetch("/api/push", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  })());
});
