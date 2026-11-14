import { useTranslations } from "next-intl";
import { isEstablished, sellerLabel, type PriceNote, type SellerLabel, formatCount } from "@baga/core";

/**
 * Shop evidence as small chips (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"): an icon and the numbers,
 * coloured by the label; the words are in the legend under the table and in each chip's accessible name.
 * Colours: violet = Kaspi rating high (solid when established), ink = mixed, amber = low rating or "check the seller",
 * faint outline = too few reviews or none.
 */
export type ChipKind = "established" | SellerLabel;
export type LegendKind = ChipKind | "check" | "fact";

const ICONS: Record<ChipKind | "tag", string> = {
  established: "M3.5 8h13M4 8l1.2-4h9.6L16 8M4.5 8v8.5h11V8M8 16.5v-4h4v4",
  high: "M10 2.5 4 5v4.5c0 3.6 2.5 6.6 6 8 3.5-1.4 6-4.4 6-8V5l-6-2.5ZM7.3 10l1.9 1.9L12.9 8",
  mixed: "M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7L10 3Z",
  low: "M10 3.5 2.5 16.5h15L10 3.5ZM10 8.5V12m0 2.4v.1",
  few: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM7.8 8a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.4v.4m0 2.3v.1",
  none: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM6.5 10h7",
  tag: "M3 10.5V3.5h7l7 7-7 7-7-7ZM6.8 6.8h.1",
};

function Icon({ d }: { d: string }) {
  return (
    <svg className="chip-icon" viewBox="0 0 20 20" width="13" height="13" aria-hidden focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

export function chipKind(rating: number | null, reviews: number | null): ChipKind {
  return isEstablished(rating, reviews) ? "established" : sellerLabel(rating, reviews);
}

const num = (n: number) => formatCount(n);

/** Kaspi rating and review count of one shop. */
export function SellerChip({ rating, reviews }: { rating: number | null; reviews: number | null }) {
  const t = useTranslations("sellers");
  const kind = chipKind(rating, reviews);
  const label = t(`legend_${kind}`);
  return (
    <span className={`chip is-${kind}`} title={label} aria-label={kind === "none" ? label : `${label}: ★${rating!.toFixed(1)}, ${t("reviews", { count: reviews! })}`}>
      <Icon d={ICONS[kind]} />
      {kind === "none" ? t("chipNone") : <>★{rating!.toFixed(1)} · {num(reviews!)}</>}
    </span>
  );
}

/** A count of shops of one kind (the home page): icon and number; the words are the accessible name. */
export function CountChip({ kind, n, label }: { kind: ChipKind; n: number; label: string }) {
  return <span className={`chip is-${kind}`} title={`${num(n)} ${label}`} aria-label={`${num(n)} ${label}`}><Icon d={ICONS[kind]} />{num(n)}</span>;
}

/** The label in words, with its icon and colour (the shop page). */
export function LabelChip({ kind }: { kind: ChipKind }) {
  const t = useTranslations("sellers");
  return <span className={`chip is-${kind}`}><Icon d={ICONS[kind]} />{t(`legend_${kind}`)}</span>;
}

/**
 * An offer far below the other sellers: the gap, and "check" unless the shop is established. `bare`: the advice
 * only, where the gap is already stated next to it (the find of the day).
 */
export function PriceNoteChip({ note, bare = false }: { note: NonNullable<PriceNote>; bare?: boolean }) {
  const t = useTranslations("sellers");
  const full = note.kind === "check" ? t("cheaper", { pct: note.pct }) : t("cheaperFact", { pct: note.pct });
  return (
    <span className={`chip is-${note.kind}`} title={full} aria-label={full}>
      <Icon d={ICONS.tag} />
      {bare ? t("checkSeller") : t(note.kind === "check" ? "noteCheck" : "noteFact", { pct: note.pct })}
    </span>
  );
}

/** What the chips in view mean: only the kinds that appear, in a fixed order. */
export function SellerLegend({ kinds, date }: { kinds: Set<LegendKind>; date?: string }) {
  const t = useTranslations("sellers");
  const order: LegendKind[] = ["established", "high", "mixed", "low", "few", "none", "check", "fact"];
  return (
    <p className="chip-legend">
      {order.filter((k) => kinds.has(k)).map((k) => (
        <span key={k} className="chip-legend-item">
          <span className={`chip is-${k} is-dot`} aria-hidden><Icon d={ICONS[k === "check" || k === "fact" ? "tag" : k]} /></span>
          {t(`legend_${k}`)}
        </span>
      ))}
      {date && <span className="chip-legend-src">{t("source", { date })}</span>}
    </p>
  );
}
