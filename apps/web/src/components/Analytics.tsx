"use client";
import { useEffect } from "react";
import { trackVisit } from "@/lib/analytics";

/** Counts the visit for the funnel (lib/analytics.ts). Renders nothing. */
export function Analytics() {
  useEffect(() => { trackVisit(); }, []);
  return null;
}
