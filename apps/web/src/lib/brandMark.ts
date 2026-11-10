/**
 * The BAĞA mark (the owner's B, 10 Nov 2026), traced as a vector: white on a stamp-violet gradient. The full mark is
 * for 60 px and up (home-screen icons); browser tabs use the simplified cut in src/app/icon.svg.
 */
const MARK = `<path d="M117 125H350C378 125 400 146 400 174C400 196 394 212 380 226C362 212 345 205 327 203H164C146 186 130 160 117 125Z"/> <path d="M117 193L154 216L117 241Z"/> <path fill-rule="evenodd" d="M117 248C140 232 165 226 190 226H330C352 226 372 230 385 236C400 255 405 282 404 310C402 362 368 400 330 400H117Z M117 395C150 360 190 300 216 286C240 276 270 272 304 274C330 264 360 245 382 226L384 236C370 258 352 280 340 294C335 304 330 312 324 317C318 309 313 302 305 299C295 297 286 297 275 298C258 300 245 302 234 308C210 330 180 370 152 400H117Z"/>`;

/** The mark as an SVG data URI: `rounded` for a standalone icon, square for iOS, which rounds the corners itself. */
export function brandMarkUri(rounded: boolean): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a46f0"/><stop offset="1" stop-color="#3a2cb4"/></linearGradient></defs><rect width="512" height="512"${rounded ? ' rx="112"' : ""} fill="url(#g)"/><g fill="#fff">${MARK}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
