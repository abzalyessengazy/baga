import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import { connectionOptions, sslFor } from "./connection";
import { SUPABASE_ROOT_CA } from "./supabase-ca";

const pooler = "postgresql://postgres.ref:pw@aws-0-eu-north-1.pooler.supabase.com:6543/postgres";

describe("sslFor", () => {
  it("verifies Supabase pooler and direct hosts against the Supabase root CA", () => {
    expect(sslFor(pooler)).toEqual({ ca: SUPABASE_ROOT_CA, rejectUnauthorized: true });
    expect(sslFor("postgresql://postgres:pw@db.ref.supabase.co:5432/postgres")).toEqual({ ca: SUPABASE_ROOT_CA, rejectUnauthorized: true });
  });
  it("verifies other remote hosts against system CAs", () => {
    expect(sslFor("postgres://u:p@db.example.kz:5432/baga")).toEqual({ rejectUnauthorized: true });
  });
  it("keeps localhost plain", () => {
    expect(sslFor("postgres://u:p@localhost:5432/baga")).toBe(false);
    expect(sslFor("postgres://u:p@127.0.0.1:5432/baga")).toBe(false);
  });
  it("leaves an explicit sslmode to postgres.js", () => {
    expect(sslFor(`${pooler}?sslmode=disable`)).toBeUndefined();
    expect(connectionOptions(`${pooler}?sslmode=disable`)).toEqual({ prepare: false });
  });
  it("does not trust look-alike hosts", () => {
    expect(sslFor("postgres://u:p@evil-supabase.com:5432/x")).toEqual({ rejectUnauthorized: true });
  });
  it("always disables prepared statements (transaction pooler)", () => {
    expect(connectionOptions(pooler).prepare).toBe(false);
  });
});

describe("embedded Supabase CA", () => {
  it("matches packages/db/prod-ca-2021.crt", () => {
    const file = readFileSync(join(__dirname, "..", "prod-ca-2021.crt"), "utf8").replace(/\r/g, "");
    expect(SUPABASE_ROOT_CA.trim()).toBe(file.trim());
  });
  it("is the Supabase Root 2021 CA and still valid", () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA);
    expect(cert.ca).toBe(true);
    expect(cert.subject).toContain("CN=Supabase Root 2021 CA");
    expect(cert.fingerprint256).toBe("80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA");
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now());
  });
});
