"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { loadMarket } from "@/lib/market";

/**
 * One line under the paste form for visitors without a link in hand (the owner, 10 Nov 2026): what got cheaper
 * this week, in the catalog's «Подешевели» list. Shown only when the week has drops (Market.deals, the same rule);
 * nothing otherwise.
 */
export function DropsHint() {
  const t = useTranslations("home");
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    loadMarket().then((m) => { if (live) setShow(!!m && m.deals.length > 0); });
    return () => { live = false; };
  }, []);
  if (!show) return null;
  return <p className="drops-hint"><Link href={{ pathname: "/explore", query: { list: "drops" } }}>{t("dropsHint")}</Link></p>;
}
