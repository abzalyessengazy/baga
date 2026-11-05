import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "./jsonLd";

const [LS, PS] = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)];

describe("jsonLdHtml", () => {
  it("cannot close the script tag, and stays the same JSON", () => {
    const data = { name: 'TV </script><script>alert(1)</script> & "55"', d: `a${LS}b${PS}c` };
    const html = jsonLdHtml(data);
    for (const c of ["<", ">", "&", LS, PS]) expect(html.includes(c)).toBe(false);
    expect(html).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(html)).toEqual(data);
  });
});
