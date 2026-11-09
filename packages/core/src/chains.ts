/**
 * Retail chains that also sell on Kaspi (9 Nov 2026, the owner's go): their Kaspi shops, by Kaspi merchant id, as
 * seen in our sellers on 9 Nov (Mechta.kz on 232 of our products, TECHNODOM 192, Evrika 119, Белый Ветер 40, ALSER
 * 35). The sellers table marks them «сеть магазинов»: a fact about the shop, not a rating. Their own websites are not
 * read (Mechta's and DNS's refuse bots); this uses only the Kaspi offers we already collect.
 */
export const RETAIL_CHAINS: Readonly<Record<string, string>> = {
  Mechta: "Mechta",
  "18430177": "Technodom",
  Evrika: "Evrika",
  "30032741": "Evrika",
  BoschCentre: "Evrika",
  Evrica: "Evrika",
  BELVETER: "Белый Ветер",
  "30486160": "Alser",
};

/** The chain behind a Kaspi shop, or null. */
export const retailChain = (sellerId: string): string | null => RETAIL_CHAINS[sellerId] ?? null;
