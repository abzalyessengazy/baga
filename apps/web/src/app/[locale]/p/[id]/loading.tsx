import { PrintWait } from "@/components/PrintWait";

/** Shown at once after a link is pasted, until the product page (or its waiting page) is ready. */
export default function Loading() {
  return (
    <main className="wrap untracked">
      <article className="receipt">
        <PrintWait />
      </article>
    </main>
  );
}
