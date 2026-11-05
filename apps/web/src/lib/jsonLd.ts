/**
 * JSON-LD for a <script> tag. Product titles come from Kaspi, so `<`, `>`, `&` and the two line separators
 * (U+2028, U+2029) are escaped: a title containing "</script>" can never close the tag and run as page code.
 */
const UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, "g");

export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}
