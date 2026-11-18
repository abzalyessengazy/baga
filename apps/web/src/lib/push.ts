import { PUSH_PUBLIC_KEY } from "@baga/core";

/**
 * Browser notifications, browser side (migration 0038). "install": an iPhone or iPad outside a home-screen app, where
 * Safari offers notifications only after «На экран "Домой"» (iOS 16.4+). "no": a browser without them.
 */
export type PushSupport = "yes" | "install" | "no";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "no";
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "install";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : "no";
}

/** Whether this browser already sends BAĞA's notifications. */
export async function pushIsOn(): Promise<boolean> {
  if (pushSupport() !== "yes" || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  return !!(await reg?.pushManager.getSubscription().catch(() => null));
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Asks the browser (must run straight from a tap: Safari refuses otherwise), subscribes and saves the subscription for
 * this visitor. "denied": the person said no (or did before; only the browser's settings can undo it).
 */
export async function enablePush(): Promise<"on" | "denied" | "failed"> {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return perm === "denied" ? "denied" : "failed";
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) }));
    const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    return res.ok ? "on" : "failed";
  } catch {
    return "failed";
  }
}
