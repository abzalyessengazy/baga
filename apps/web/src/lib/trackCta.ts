/**
 * The way to the coupon from anywhere on the product page (the owner, 16 Nov: on a phone the coupon sat ~2.5 screens
 * down and 4 in 5 people who opened a product never tracked it). TrackJump (under the verdict) and TrackBar (fixed at
 * the bottom on phones) ask for it; TrackPanel scrolls to itself, opens the ranges, and says whether this visitor
 * already tracks the product, so both hide then.
 */
export const OPEN_EVENT = "baga:track-open";
export const STATE_EVENT = "baga:track-state";
export type TrackState = { tracking: boolean };
export const openTracking = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** The latest state, kept for a component that starts listening after TrackPanel already said it. */
let last: boolean | null = null;
if (typeof window !== "undefined") window.addEventListener(STATE_EVENT, (e) => { last = (e as CustomEvent<TrackState>).detail.tracking; });
export const lastTracking = () => last;
