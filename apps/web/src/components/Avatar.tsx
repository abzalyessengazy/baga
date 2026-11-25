import type { Avatar as AvatarId } from "@baga/core";

/** The stock avatars (packages/core profile.ts): plain emoji faces (medium skin tone: dark hair), nothing uploaded, nothing personal. */
const FACE: Record<AvatarId, string> = {
  girl: "👧🏽",
  boy: "👦🏽",
  woman: "👩🏽",
  man: "👨🏽",
  scarf: "🧕🏽",
  granny: "👵🏽",
  grandpa: "👴🏽",
  beard: "🧔🏽",
  coder: "🧑🏽‍💻",
  student: "🧑🏽‍🎓",
  office: "👩🏽‍💼",
  teacher: "👩🏽‍🏫",
  doctor: "👩🏽‍⚕️",
  mechanic: "👨🏽‍🔧",
  cook: "👨🏽‍🍳",
  farmer: "👨🏽‍🌾",
  cat: "🐱",
  horse: "🐎",
  eagle: "🦅",
  camel: "🐫",
};

/** A round paper chip with the face; a visitor without a profile gets the receipt. `live` adds a slow idle bob. */
export function Avatar({ id, size = 40, live }: { id: string | null; size?: number; live?: boolean }) {
  const face = (id && FACE[id as AvatarId]) || "🧾";
  return (
    <span className={`avatar${live ? " is-live" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.56) }} aria-hidden>
      <span>{face}</span>
    </span>
  );
}
