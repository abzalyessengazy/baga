export function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="line">
      <span className="k">{k}</span>
      <span className="dots" aria-hidden />
      <span className="v">{v}</span>
    </div>
  );
}
