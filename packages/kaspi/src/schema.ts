import { z } from "zod";

/** Only the fields BAGA uses. Unknown fields are ignored so small API changes don't break parsing. */
// Only the seller id and the price are required; a seller without a name is shown by id.
export const KaspiOfferSchema = z.object({
  merchantId: z.union([z.string(), z.number()]).transform(String),
  merchantName: z.string().nullable().optional(),
  merchantRating: z.number().nullable().optional(),
  merchantReviewsQuantity: z.number().nullable().optional(),
  price: z.number().positive(),
  delivery: z.string().nullable().optional(),
  deliveryDuration: z.string().nullable().optional(),
  preorder: z.number().nullable().optional(),
});

/** Offers are checked one by one in `parseOffers`, so one odd seller entry does not lose the whole product. */
export const KaspiOffersResponseSchema = z.object({
  offers: z.array(z.unknown()),
  total: z.number().optional(),
  offersCount: z.number().optional(),
});

export const KaspiCardSchema = z.object({
  card: z.object({
    id: z.string(),
    title: z.string(),
    price: z.number().optional(),
    rating: z.number().optional(),
    reviewsQuantity: z.number().optional(),
    shopLink: z.string().optional(),
  }),
  galleryImages: z.array(z.object({ large: z.string().optional(), medium: z.string().optional() })).optional(),
  breadcrumbs: z.array(z.object({ title: z.string(), id: z.string().optional() })).optional(),
});

export type KaspiOffer = z.infer<typeof KaspiOfferSchema>;
export type KaspiCard = z.infer<typeof KaspiCardSchema>;
