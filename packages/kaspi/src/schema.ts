import { z } from "zod";

/** Only the fields BAGA uses. Unknown fields are ignored so small API changes don't break parsing. */
export const KaspiOfferSchema = z.object({
  masterSku: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  merchantRating: z.number().nullable().optional(),
  merchantReviewsQuantity: z.number().nullable().optional(),
  title: z.string(),
  price: z.number().positive(),
  delivery: z.string().nullable().optional(),
  deliveryDuration: z.string().nullable().optional(),
  preorder: z.number().nullable().optional(),
});

export const KaspiOffersResponseSchema = z.object({
  offers: z.array(KaspiOfferSchema),
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
