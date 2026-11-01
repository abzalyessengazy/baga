function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  resendApiKey: () => process.env.RESEND_API_KEY ?? null,
  emailFrom: () => process.env.EMAIL_FROM ?? "BAGA <alerts@baga.app>",
  siteUrl: () => process.env.SITE_URL ?? "http://localhost:3000",
  healthcheckUrl: () => process.env.HEALTHCHECK_URL ?? null,
  /** Products claimed per batch; the run keeps claiming batches until the visit window closes. */
  chunkSize: () => Number(process.env.COLLECT_CHUNK ?? 10),
  /** How long a run started early may wait for the visit window to open (otherwise it skips). */
  windowWaitMaxMs: () => Number(process.env.COLLECT_WINDOW_WAIT_MIN ?? 20) * 60_000,
  runner: () => process.env.COLLECT_RUNNER ?? "local",
};
