import { describe, expect, it } from "vitest";
import { turnstileSecret, verifyTurnstile, TURNSTILE_TEST_SECRET } from "./turnstile";

const reply = (json: unknown, calls: { body: string }[] = []) =>
  (async (_url: string, init: RequestInit) => {
    calls.push({ body: String(init.body) });
    return new Response(JSON.stringify(json));
  }) as unknown as typeof fetch;

describe("turnstileSecret", () => {
  it("uses the configured secret", () => {
    expect(turnstileSecret({ TURNSTILE_SECRET_KEY: "real", NODE_ENV: "production" })).toBe("real");
  });
  it("falls back to Cloudflare's test secret outside production", () => {
    expect(turnstileSecret({ NODE_ENV: "development" })).toBe(TURNSTILE_TEST_SECRET);
  });
  it("fails closed in production without a secret", () => {
    expect(turnstileSecret({ NODE_ENV: "production" })).toBeNull();
  });
});

describe("verifyTurnstile", () => {
  it("accepts a token Cloudflare confirms and forwards the client IP", async () => {
    const calls: { body: string }[] = [];
    expect(await verifyTurnstile("tok", "1.2.3.4", { secret: "s", fetch: reply({ success: true, action: "lookup" }, calls), expectedAction: "lookup" })).toEqual({ ok: true });
    expect(calls[0]!.body).toContain("remoteip=1.2.3.4");
    expect(calls[0]!.body).toContain("response=tok");
  });
  it("rejects what Cloudflare rejects", async () => {
    expect(await verifyTurnstile("tok", null, { secret: "s", fetch: reply({ success: false }) })).toEqual({ ok: false, reason: "rejected" });
  });
  it("rejects a token issued for another action", async () => {
    expect(await verifyTurnstile("tok", null, { secret: "s", fetch: reply({ success: true, action: "resolve" }), expectedAction: "lookup" })).toEqual({ ok: false, reason: "rejected" });
  });
  it("needs a token and a secret, without calling Cloudflare", async () => {
    const calls: { body: string }[] = [];
    expect(await verifyTurnstile("", null, { secret: "s", fetch: reply({ success: true }, calls) })).toEqual({ ok: false, reason: "missing_token" });
    expect(await verifyTurnstile("tok", null, { secret: null, fetch: reply({ success: true }, calls) })).toEqual({ ok: false, reason: "no_secret" });
    expect(calls).toHaveLength(0);
  });
  it("treats a network failure as not verified", async () => {
    const boom = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", null, { secret: "s", fetch: boom })).toEqual({ ok: false, reason: "unreachable" });
  });
});
