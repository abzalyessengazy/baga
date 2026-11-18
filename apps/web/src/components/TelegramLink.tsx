"use client";
import { track } from "@/lib/analytics";

/** «Подключить Telegram» on a server-rendered page: the same link, and the tap counts in the connect funnel (0037). */
export function TelegramLink({ href, className, where, children }: { href: string; className: string; where: string; children: React.ReactNode }) {
  return <a className={className} href={href} target="_blank" rel="noopener" onClick={() => track("channel_tap", { detail: where })}>{children}</a>;
}
