// Fails when ru.json and kk.json don't have exactly the same keys, or a value is empty.
import { readFileSync } from "node:fs";
const load = (l) => JSON.parse(readFileSync(new URL(`../apps/web/messages/${l}.json`, import.meta.url), "utf8"));
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const ru = new Map(flat(load("ru")));
const kk = new Map(flat(load("kk")));
const problems = [];
for (const k of ru.keys()) if (!kk.has(k)) problems.push(`kk missing: ${k}`);
for (const k of kk.keys()) if (!ru.has(k)) problems.push(`ru missing: ${k}`);
for (const [l, m] of [["ru", ru], ["kk", kk]]) for (const [k, v] of m) if (!String(v).trim()) problems.push(`${l} empty: ${k}`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`i18n ok: ${ru.size} keys in ru and kk`);
