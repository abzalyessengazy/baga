import { NextResponse } from "next/server";
import { getSql, signOutElsewhere } from "@baga/db";
import { currentWatcher, hashSecret } from "@/lib/watcher";

/** «Выйти на других устройствах» (DECISIONS.md, 2026-11-16): other browsers' keys go, links in old messages stop signing in. */
export async function POST() {
  const sql = getSql();
  const found = await currentWatcher().catch(() => null);
  if (!sql || !found) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const n = await signOutElsewhere(sql, found.watcher.id, hashSecret(found.secret));
  return NextResponse.json({ code: "done", n }, { headers: { "Cache-Control": "private, no-store" } });
}
