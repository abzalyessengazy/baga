import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseKaspiUrl, canonicalProductUrl, shortLinkCode, variantLinkCode, queuedLinkUrl } from "./url";
import { parseOffers, parseProductPage, buildSnapshot, KaspiParseError } from "./snapshot";
import { createKaspiClient, KaspiHttpError } from "./client";

const fx = (f: string) => readFileSync(join(__dirname, "..", "fixtures", f), "utf8");

describe("parseKaspiUrl", () => {
  const ok = [
    "https://kaspi.kz/shop/p/apple-iphone-18-pro-256gb-nanosim-esim-serebristyi-177318181/",
    "https://kaspi.kz/shop/p/apple-iphone-18-pro-256gb-nanosim-esim-serebristyi-177318181/?c=750000000&ref=shared_link",
    "kaspi.kz/shop/p/apple-iphone-18-pro-256gb-nanosim-esim-serebristyi-177318181",
    "https://m.kaspi.kz/shop/p/apple-iphone-18-pro-256gb-nanosim-esim-serebristyi-177318181/",
    "Смотри, что нашёл: https://kaspi.kz/shop/p/apple-iphone-18-pro-256gb-nanosim-esim-serebristyi-177318181/?ref=shared_link",
    "https://kaspi.kz/shop/p/-177318181/",
  ];
  it.each(ok)("accepts %s", (u) => {
    const r = parseKaspiUrl(u);
    expect(r.ok && r.productId).toBe("177318181");
  });
  it("keeps the slug", () => {
    const r = parseKaspiUrl(ok[0]!);
    expect(r.ok && r.slug).toBe("apple-iphone-18-pro-256gb-nanosim-esim-serebristyi");
  });
  it("rejects other shapes with a reason", () => {
    expect(parseKaspiUrl("iphone 18")).toEqual({ ok: false, reason: "not_a_url" });
    expect(parseKaspiUrl("https://ozon.kz/product/123")).toEqual({ ok: false, reason: "not_kaspi" });
    expect(parseKaspiUrl("https://kaspi.kz/shop/c/smartphones/")).toEqual({ ok: false, reason: "not_a_product" });
    expect(parseKaspiUrl("https://l.kaspi.kz/shop/abc")).toEqual({ ok: false, reason: "short_link" });
    expect(parseKaspiUrl("https://kaspi.kz.evil.com/shop/p/x-177318181/").ok).toBe(false);
  });
  it("builds canonical URLs", () => {
    expect(canonicalProductUrl("177318181", "abc")).toBe("https://kaspi.kz/shop/p/abc-177318181/");
  });
});

describe("parsers", () => {
  it("parses real offers, sorted, integer tenge, names normalised", () => {
    const offers = parseOffers(JSON.parse(fx("offers-177318181.json")));
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({ sellerName: "KHAN MOBILE", price: 749364, sellerRating: 4.8 });
    expect(offers[1]!.sellerName).toBe("WORLD Верифицированных IMEI");
    expect(offers.map((o) => o.price)).toEqual([749364, 749464, 749977]);
  });
  it("keeps sellers that ship later (preorder days), so the lowest price is right", () => {
    const offers = parseOffers(JSON.parse(fx("offers-180533183.json")));
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({ sellerName: "TECHNODOM", price: 1399990, preorderDays: 3 });
  });
  it("rejects a malformed response instead of inventing a price", () => {
    expect(() => parseOffers({ offers: [{ price: "cheap" }] })).toThrow(KaspiParseError);
    expect(() => parseOffers({ items: [] })).toThrow(/keys/);
  });
  it("skips one unusable seller entry and keeps the rest", () => {
    const real = JSON.parse(fx("offers-177318181.json")) as { offers: Record<string, unknown>[] };
    const odd = [{ ...real.offers[0], price: null }, { ...real.offers[1], merchantName: null, merchantId: 42, title: undefined }, real.offers[2]];
    const offers = parseOffers({ offers: odd });
    expect(offers.map((o) => o.price)).toEqual([749464, 749977]);
    expect(offers[0]).toMatchObject({ sellerId: "42", sellerName: "42" });
  });
  it("reads an empty offers list as no sellers", () => {
    expect(parseOffers({ offers: [], total: 0 })).toEqual([]);
  });
  it("parses the product page data block", () => {
    const p = parseProductPage(fx("product-177318181.html"));
    expect(p.title).toBe("Смартфон Apple iPhone 18 Pro 256Gb NanoSIM+eSIM серебристый");
    expect(p.imageUrl).toContain("gallery-large");
    expect(p.categoryPath).toEqual(["Телефоны и гаджеты", "Смартфоны"]);
    expect(p.reviews).toBe(81);
    expect(p.rating).toBe(5);
  });
  it("throws when the data block is missing", () => {
    expect(() => parseProductPage("<html></html>")).toThrow(KaspiParseError);
  });
  it("builds a snapshot", () => {
    const s = buildSnapshot(parseProductPage(fx("product-177318181.html")), parseOffers(JSON.parse(fx("offers-177318181.json"))));
    expect(s.minPrice).toBe(749364);
    expect(s.inStock).toBe(true);
  });
});

describe("client", () => {
  it("resolves l.kaspi.kz short links with a non-following GET", async () => {
    const seen: RequestInit[] = [];
    const target = "https://kaspi.kz/shop/p/apple-macbook-pro-14-2025-chernyi-151699831/?c=231010000&ref=shared_link";
    const client = createKaspiClient({
      fetch: (async (_url: string, init: RequestInit) => {
        seen.push(init);
        return new Response(null, { status: 302, headers: { Location: target } });
      }) as unknown as typeof fetch,
    });
    const got = await client.resolveShortLink("https://l.kaspi.kz/shop/D5zGA9hPyp8zi3w?sessionId=x");
    expect(got).toBe(target);
    expect(parseKaspiUrl(got!)).toMatchObject({ ok: true, productId: "151699831" });
    expect(seen[0]).toMatchObject({ method: "GET", redirect: "manual" });
  });

  it("resolves relative short-link redirects and throws when Kaspi refuses", async () => {
    const relative = createKaspiClient({
      fetch: (async () => new Response(null, { status: 301, headers: { Location: "/shop/p/x-151699831/" } })) as unknown as typeof fetch,
    });
    expect(await relative.resolveShortLink("https://l.kaspi.kz/shop/abc")).toBe("https://l.kaspi.kz/shop/p/x-151699831/");
    const refused = createKaspiClient({ fetch: (async () => new Response("", { status: 429 })) as unknown as typeof fetch });
    const err = await refused.resolveShortLink("https://l.kaspi.kz/shop/abc").catch((e) => e);
    expect(err).toBeInstanceOf(KaspiHttpError);
    expect(err.status).toBe(429);
  });

  it("sends the reference city and maps blocking statuses", async () => {
    const calls: RequestInit[] = [];
    const client = createKaspiClient({
      fetch: (async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response("", { status: 429 });
      }) as unknown as typeof fetch,
    });
    const err = await client.fetchOffers("177318181").catch((e) => e);
    expect(err).toBeInstanceOf(KaspiHttpError);
    expect(err.isBlocking).toBe(true);
    expect((calls[0]!.headers as Record<string, string>)["X-KS-City"]).toBe("750000000");
  });

  it("spaces request starts by minIntervalMs + jitter (robots.txt Crawl-delay)", async () => {
    let t = 1_000_000;
    const starts: number[] = [];
    const client = createKaspiClient({
      minIntervalMs: 10_000,
      jitterMs: 2_000,
      clock: { now: () => t, sleep: async (ms) => { t += ms; }, random: () => 0.5 },
      fetch: (async () => {
        starts.push(t);
        t += 300; // the request itself takes 300 ms
        return new Response("", { status: 404 });
      }) as unknown as typeof fetch,
    });
    // fired concurrently on purpose: the gate must still serialise them
    await Promise.all([
      client.fetchOffers("177318181").catch(() => {}),
      client.fetchOffers("177318415").catch(() => {}),
      client.fetchProductPage("180533183").catch(() => {}),
    ]);
    expect(starts).toHaveLength(3);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBe(11_000);
  });

  it("does not wait at all when no interval is set (web on-demand lookups)", async () => {
    let slept = 0;
    const client = createKaspiClient({
      clock: { now: () => 0, sleep: async (ms) => { slept += ms; } },
      fetch: (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
    });
    await client.fetchOffers("177318181").catch(() => {});
    await client.fetchOffers("177318181").catch(() => {});
    expect(slept).toBe(0);
  });

  it("default User-Agent contains no URL (Kaspi stalls such requests)", async () => {
    const saved = process.env.KASPI_USER_AGENT;
    delete process.env.KASPI_USER_AGENT;
    try {
      const calls: RequestInit[] = [];
      const client = createKaspiClient({
        fetch: (async (_url: string, init: RequestInit) => {
          calls.push(init);
          return new Response("", { status: 404 });
        }) as unknown as typeof fetch,
      });
      await client.fetchProductPage("177318181").catch(() => {});
      await client.fetchOffers("177318181").catch(() => {});
      for (const init of calls) {
        const ua = (init.headers as Record<string, string>)["User-Agent"]!;
        expect(ua).toBeTruthy();
        expect(ua).not.toMatch(/https?:\/\/|www\./i);
      }
      expect(calls).toHaveLength(2);
    } finally {
      if (saved !== undefined) process.env.KASPI_USER_AGENT = saved;
    }
  });
});

describe("shortLinkCode", () => {
  it("takes the code from links shared by the Kaspi app", () => {
    expect(shortLinkCode("https://l.kaspi.kz/shop/D5zGA9hPyp8zi3w?sessionId=7c54d10f-0aa4-44f8-893b-862ff30a128d1793558424"))
      .toEqual({ code: "D5zGA9hPyp8zi3w", path: "/shop/D5zGA9hPyp8zi3w" });
    expect(shortLinkCode("Смотри: https://l.kaspi.kz/AbCd123/ ")).toEqual({ code: "AbCd123", path: "/AbCd123" });
    expect(shortLinkCode("https://l.kaspi.kz/shop/../../etc")).toBeNull();
    expect(shortLinkCode("https://l.kaspi.kz.evil.example/shop/abcd")).toBeNull();
    expect(shortLinkCode("https://kaspi.kz/shop/p/x-1/")).toBeNull();
  });
});

describe("variantLinkCode", () => {
  const shared = "https://kaspi.kz/shop/p/polubotinki-tigran-tgrn0023m-chernyi-46-15956323b/?c=231010000&m=30340019&hasVariants=true&ref=shared_link";
  it("reads the group code of a product with variants (seen 3 Nov 2026)", () => {
    expect(parseKaspiUrl(shared)).toEqual({ ok: false, reason: "not_a_product" });
    expect(variantLinkCode(shared)).toEqual({ code: "15956323b", path: "/shop/p/-15956323b/" });
    expect(queuedLinkUrl("/shop/p/-15956323b/")).toBe("https://kaspi.kz/shop/p/-15956323b/");
  });
  it("the slug-less group URL redirects to a plain product (302s seen 3 Nov 2026)", () => {
    const target = new URL("/shop/p/mahrovyi-halat-massimo-monelli-1028-belyi-3xl-114891272/?hasVariants=true", "https://kaspi.kz/shop/p/-11651361b/").toString();
    expect(variantLinkCode(target)).toBeNull();
    expect(parseKaspiUrl(target)).toMatchObject({ ok: true, productId: "114891272" });
    expect(variantLinkCode("https://kaspi.kz/shop/p/mahrovyi-halat-massimo-monelli-belyi-11651361b/")).toEqual({ code: "11651361b", path: "/shop/p/-11651361b/" });
  });
  it("leaves plain product links, other hosts and short links alone", () => {
    expect(variantLinkCode("https://kaspi.kz/shop/p/apple-iphone-18-pro-177318181/")).toBeNull();
    expect(variantLinkCode("https://evil.kz/shop/p/x-15956323b/")).toBeNull();
    expect(queuedLinkUrl("/shop/D5zGA9hPyp8zi3w")).toBe("https://l.kaspi.kz/shop/D5zGA9hPyp8zi3w");
  });
});
