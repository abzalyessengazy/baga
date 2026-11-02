/**
 * The BAGA wordmark. "Баға" is Kazakh for price; its Ғ is written Ğ in the Kazakh Latin alphabet, so the G carries
 * a stamp-violet breve. Screen readers hear "BAGA".
 */
export function Wordmark() {
  return (
    <span className="wordmark" aria-label="BAGA" role="img">
      <span aria-hidden>BA</span><span className="wordmark-g" aria-hidden>G</span><span aria-hidden>A</span>
    </span>
  );
}
