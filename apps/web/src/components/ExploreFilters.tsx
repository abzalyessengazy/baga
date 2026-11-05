"use client";
import { useRef } from "react";

type Opt = { value: string; label: string };

/**
 * Search, category and sort for /explore (and search and sort for /shops, without categories). A plain GET form,
 * so it works without scripts; choosing a category or a sort applies it at once.
 */
export function ExploreFilters({ list, q, cat, sort, sorts, categories, labels }: {
  list: string; q: string; cat?: string; sort: string; sorts: Opt[]; categories?: Opt[];
  labels: { search: string; category?: string; allCategories?: string; sort: string; apply: string };
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();
  return (
    <form ref={form} className="explore-filters" method="get" role="search">
      <input type="hidden" name="list" value={list} />
      <label className="explore-q">
        <span className="sr-only">{labels.search}</span>
        <input type="search" name="q" defaultValue={q} placeholder={labels.search} maxLength={80} autoComplete="off" />
      </label>
      {categories && <label>
        <span className="sr-only">{labels.category}</span>
        <select name="cat" defaultValue={cat} onChange={submit}>
          <option value="">{labels.allCategories}</option>
          {cat && !categories.some((c) => c.value === cat) && <option value={cat}>{cat}</option>}
          {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>}
      <label>
        <span className="sr-only">{labels.sort}</span>
        <select name="sort" defaultValue={sort} onChange={submit}>
          {sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <button type="submit" className="btn explore-apply">{labels.apply}</button>
    </form>
  );
}
