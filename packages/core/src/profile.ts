/**
 * A visitor's profile (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"): a made-up nickname, a
 * stock avatar and a few answers, never a name, phone or address. Pure rules; the words live in the messages files.
 */
export const AVATARS = ["girl", "boy", "woman", "man", "scarf", "granny", "grandpa", "beard", "coder", "cat"] as const;
export type Avatar = (typeof AVATARS)[number];
export const isAvatar = (v: unknown): v is Avatar => typeof v === "string" && (AVATARS as readonly string[]).includes(v);

/** «Зачем вы здесь?» */
export const VISIT_REASONS = ["wait_drop", "check_discount", "cheapest_seller", "gift", "browsing"] as const;
export type VisitReason = (typeof VISIT_REASONS)[number];
export const isVisitReason = (v: unknown): v is VisitReason => typeof v === "string" && (VISIT_REASONS as readonly string[]).includes(v);

/** «Сколько хотите сэкономить?» in tenge. */
export const SAVE_GOALS = [10_000, 50_000, 100_000, 300_000] as const;
export const isSaveGoal = (v: unknown): v is number => typeof v === "number" && (SAVE_GOALS as readonly number[]).includes(v);

/** «Что вам интересно?»: a code and Kaspi's top-level category it stands for (products.category_path[1]). */
export const INTERESTS = {
  phones: "Телефоны и гаджеты", computers: "Компьютеры", tv: "ТВ, Аудио, Видео", appliances: "Бытовая техника",
  beauty: "Красота и здоровье", furniture: "Мебель", sport: "Спорт, туризм", kids: "Детские товары",
} as const;
export type Interest = keyof typeof INTERESTS;
export const INTEREST_CODES = Object.keys(INTERESTS) as Interest[];
export const isInterest = (v: unknown): v is Interest => typeof v === "string" && v in INTERESTS;

export const NICKNAME = { min: 2, max: 20 } as const;
export type NicknameError = "length" | "chars" | "personal" | "reserved";
// Names that would pass for the site itself, and a short list of words nobody should meet on a public board.
const RESERVED = ["baga", "бага", "baғa", "bağa", "admin", "админ", "moder", "модер", "kaspi", "каспи", "support", "поддержк"];
const RUDE = ["хуй", "хуе", "хуё", "пизд", "ебат", "ебан", "ёб", "бляд", "блят", "сука", "суч", "мудак", "пидор", "пидар", "гандон", "шлюх", "долбо", "қотақ", "котак", "сігі", "сиги", "жәлеп", "fuck", "shit", "bitch", "cunt", "nigg", "dick", "porn", "sex"];

/** Trims and joins repeated spaces; the form the nickname is stored and compared in. */
export const cleanNickname = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Why a nickname cannot be used, or null. Letters of any alphabet, digits, a space, `_`, `.` and `-`; nothing that
 * looks like contact details (an @, or a run of 6+ digits), so the board never carries personal data.
 */
export function nicknameError(raw: string): NicknameError | null {
  const s = cleanNickname(raw);
  const n = [...s].length;
  if (n < NICKNAME.min || n > NICKNAME.max) return "length";
  if (/@|\d{6,}|https?:|www\.|\.(kz|ru|com)\b/i.test(s)) return "personal";
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u.test(s)) return "chars";
  const flat = s.toLowerCase().replace(/[ _.\-]/g, "").replace(/0/g, "o").replace(/3/g, "e").replace(/1/g, "i");
  if ([...RESERVED, ...RUDE].some((w) => flat.includes(w))) return "reserved";
  return null;
}

/** Levels by how many products a visitor tracks now. */
export const LEVELS = [
  { id: "newcomer", from: 0 }, { id: "scout", from: 1 }, { id: "hunter", from: 3 }, { id: "sniper", from: 5 }, { id: "master", from: 10 },
] as const;
export type LevelId = (typeof LEVELS)[number]["id"];

/** The level for `tracked` products, and how many more reach the next one (null at the top). */
export function levelFor(tracked: number): { id: LevelId; index: number; next: { id: LevelId; need: number; from: number } | null; progress: number } {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (tracked >= LEVELS[k]!.from) i = k;
  const cur = LEVELS[i]!, nx = LEVELS[i + 1];
  if (!nx) return { id: cur.id, index: i, next: null, progress: 1 };
  return { id: cur.id, index: i, next: { id: nx.id, need: nx.from - tracked, from: nx.from }, progress: (tracked - cur.from) / (nx.from - cur.from) };
}

/** What a tracking adds to «хочу сэкономить»: the current price above the visitor's own price, never below zero. */
export const potentialSaving = (now: number | null, target: number | null) => (now !== null && target !== null && now > target ? now - target : 0);

/** The 3-day note: how a product's price moved since the reference. */
export const DIGEST = { everyDays: 3, /** A daily job drifts: due from this many hours after the last note. */ dueHours: 68, maxItems: 5, suggestions: 3 } as const;
export type DigestMood = "down" | "up" | "stable";
/** One mood for the whole note: any drop is the news; else any rise; else stable. */
export function digestMood(moves: (-1 | 0 | 1)[]): DigestMood {
  if (moves.includes(-1)) return "down";
  if (moves.includes(1)) return "up";
  return "stable";
}
