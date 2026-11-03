function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  resendApiKey: () => process.env.RESEND_API_KEY ?? null,
  telegramBotToken: () => process.env.TELEGRAM_BOT_TOKEN?.trim() || null,
  /** Public channel for the daily drops post (@name or -100… id; the bot must be its admin). Unset: no post. */
  telegramChannel: () => process.env.TELEGRAM_CHANNEL?.trim() || null,
  telegramChannelLocale: (): "ru" | "kk" => (process.env.TELEGRAM_CHANNEL_LOCALE === "kk" ? "kk" : "ru"),
  emailFrom: () => process.env.EMAIL_FROM?.trim() || "BAGA <alerts@bagaapp.com>",
  // Links in emails and Telegram buttons. Never localhost by accident: Telegram rejects such buttons (3 Nov 2026).
  siteUrl: () => (process.env.SITE_URL?.trim() || "https://bagaapp.com").replace(/\/+$/, ""),
  healthcheckUrl: () => process.env.HEALTHCHECK_URL ?? null,
  /** Products claimed per batch; the run keeps claiming batches until the visit window closes. */
  chunkSize: () => Number(process.env.COLLECT_CHUNK ?? 10),
  /** How long a run started early may wait for the visit window to open (otherwise it skips). */
  /** When idle inside the window, how often to look for new visitor requests. */
  idlePollMs: () => Number(process.env.COLLECT_IDLE_POLL_S ?? 60) * 1000,
  windowWaitMaxMs: () => Number(process.env.COLLECT_WINDOW_WAIT_MIN ?? 20) * 60_000,
  runner: () => process.env.COLLECT_RUNNER ?? "local",
};
