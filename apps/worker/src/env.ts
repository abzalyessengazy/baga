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
  batchSize: () => Number(process.env.COLLECT_BATCH ?? 60),
  requestDelayMs: () => Number(process.env.COLLECT_DELAY_MS ?? 900),
  runner: () => process.env.COLLECT_RUNNER ?? "local",
};
