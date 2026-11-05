/**
 * Small line icons for stat labels, in the label's colour (DESIGN: one accent; icons stay ink-soft, numbers carry the
 * colour). 14 px, decorative: the label next to them says what the number is.
 */
export type StatIconName = "box" | "store" | "calendar" | "down" | "up";

const PATHS: Record<StatIconName, string> = {
  box: "M3 6.5 10 3l7 3.5v7L10 17l-7-3.5v-7Zm0 0L10 10l7-3.5M10 10v7",
  store: "M3.5 8h13M4 8l1.2-4h9.6L16 8M4.5 8v8.5h11V8M8 16.5v-4h4v4",
  calendar: "M4 5.5h12v11H4v-11Zm0 3.5h12M7.5 3.5v3M12.5 3.5v3",
  down: "M3 6l5 5 3-3 6 6m0 0v-4.5m0 4.5h-4.5",
  up: "M3 14l5-5 3 3 6-6m0 0v4.5m0-4.5h-4.5",
};

export function StatIcon({ name }: { name: StatIconName }) {
  return (
    <svg className="stat-icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
