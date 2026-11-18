/** The guide pages (DECISIONS.md 2026-11-18 "Guides for search and AI answers"): address → messages key (guide.<key>). */
export const GUIDES = { "real-discount": "realDiscount", "price-history": "priceHistory", "price-alerts": "priceAlerts" } as const;
export type GuideSlug = keyof typeof GUIDES;
export const GUIDE_SLUGS = Object.keys(GUIDES) as GuideSlug[];
export const isGuide = (s: string): s is GuideSlug => s in GUIDES;
