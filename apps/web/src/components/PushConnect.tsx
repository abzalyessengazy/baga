"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { enablePush, pushIsOn, pushSupport, type PushSupport } from "@/lib/push";
import { track } from "@/lib/analytics";
import { PROFILE_EVENT } from "@/lib/profileClient";

/**
 * «Уведомления в браузере» (migration 0038): a channel with no app, number or address. Hidden where the browser has
 * none; on an iPhone outside a home-screen app it says how to add BAĞA to the home screen instead. `onOn` tells the
 * coupon that alerts now have somewhere to go.
 */
export function PushConnect({ where, onOn, button = "btn btn-ghost" }: { where: string; onOn?: () => void; button?: string }) {
  const t = useTranslations("push");
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<"off" | "busy" | "on" | "denied" | "failed">("off");
  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === "yes") {
      if (Notification.permission === "denied") setState("denied");
      pushIsOn().then((on) => { if (on) { setState("on"); onOn?.(); } });
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (support === null || support === "no") return null;
  if (support === "install") return <p className="note push-install">{t("install")}</p>;
  if (state === "on") return <p className="channel-ok">✓ {t("on")}</p>;

  const turnOn = async () => {
    setState("busy");
    track("channel_tap", { detail: where });
    const r = await enablePush();
    setState(r);
    if (r === "on") { onOn?.(); window.dispatchEvent(new Event(PROFILE_EVENT)); }
  };
  return (
    <div className="push-connect">
      <button type="button" className={`${button}${state === "busy" ? " is-busy" : ""}`} disabled={state === "busy"} onClick={turnOn} style={{ width: "100%" }}>
        {t("connect")}
      </button>
      <p className="note">{state === "denied" ? t("denied") : state === "failed" ? t("failed") : t("hint")}</p>
    </div>
  );
}
