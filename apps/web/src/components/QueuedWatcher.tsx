"use client";
import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** Re-renders the page every 10 s (for up to 15 min) so it turns into the product page once the price is saved. */
export function QueuedWatcher() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 15 * 60_000) { clearInterval(timer); return; }
      if (document.visibilityState === "visible") router.refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
