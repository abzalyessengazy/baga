import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { refreshPages, refreshSignature } from "./siteRefresh";

describe("refreshSignature", () => {
  it("is the HMAC the site checks (apps/web/src/app/api/revalidate-products/route.ts)", () => {
    const key = createHash("sha256").update("baga-revalidate:tok").digest();
    expect(refreshSignature("tok", "{}")).toBe(createHmac("sha256", key).update("{}").digest("hex"));
    expect(refreshSignature("other", "{}")).not.toBe(refreshSignature("tok", "{}"));
  });
});

describe("refreshPages", () => {
  it("sends signed batches of at most 200 ids", async () => {
    const calls: { url: string; body: string; sig: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), sig: (init.headers as Record<string, string>)["X-Baga-Signature"]! });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const ids = Array.from({ length: 450 }, (_, i) => String(100000 + i));
    expect(await refreshPages("https://bagaapp.com", "tok", ids, fake)).toBe(450);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toBe("https://bagaapp.com/api/revalidate-products");
    expect(JSON.parse(calls[2]!.body).ids).toHaveLength(50);
    for (const c of calls) expect(c.sig).toBe(refreshSignature("tok", c.body));
  });
  it("does nothing without a token, and never throws", async () => {
    const boom = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await refreshPages("https://x", null, ["123456"], boom)).toBe(0);
    expect(await refreshPages("https://x", "tok", ["123456"], boom)).toBe(0);
  });
});
