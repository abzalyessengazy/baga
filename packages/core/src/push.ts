/**
 * The public half of BAĞA's push key (VAPID, RFC 8292; DECISIONS.md 2026-11-18 "Browser notifications"). Browsers
 * subscribe with it and push services check the collector's signature against it; the private half is only in the
 * collector's secrets (VAPID_PRIVATE_KEY). A new pair means every browser subscribes again.
 */
export const PUSH_PUBLIC_KEY = "BEYMsWslVqiGMashEKirwKVKhNmDkiM1sDcyBX0l9p06UXh8ai2Bx-In6tDkdHBNqN6Ij2njMsE4VfNH4R4U2wg";
