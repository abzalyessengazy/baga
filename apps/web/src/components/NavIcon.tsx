/**
 * Header icons (phones show them instead of the words, the owner, 10 Nov 2026). Line icons in the text colour;
 * each link keeps its word for screen readers and as a tooltip.
 */
const PATHS = {
  catalog: "M3.5 3.5h5v5h-5v-5Zm8 0h5v5h-5v-5Zm-8 8h5v5h-5v-5Zm8 0h5v5h-5v-5Z",
  shops: "M3.5 8h13M4 8l1.2-4h9.6L16 8M4.5 8v8.5h11V8M8 16.5v-4h4v4",
  my: "M5.5 3h9v14l-4.5-3.2L5.5 17V3Z",
} as const;

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg className="nav-ico" viewBox="0 0 20 20" width="22" height="22" aria-hidden focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[name]} /></svg>
  );
}
