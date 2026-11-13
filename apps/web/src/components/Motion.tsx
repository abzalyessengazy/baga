"use client";
import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * True while the element is on screen, and false again once it has left: its animation plays every time the visitor
 * reaches it, not once at page load while they are still reading the top (the owner, 13 Nov: «animations are done
 * before the user scrolls to them»). With reduced motion it is always true, so nothing moves.
 */
export function useReplay(ref: RefObject<Element | null>, amount = 0.25): boolean {
  const reduce = useReducedMotion();
  const seen = useInView(ref, { amount });
  return seen || !!reduce;
}

/** A number that counts up from zero each time it comes into view. `format` turns the running value into text. */
export function CountUp({ value, format, duration = 0.9 }: { value: number; format: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const seen = useInView(ref, { amount: 0.6 });
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduce || !seen) { setShown(value); return; }
    const c = animate(0, value, { duration, ease: [0.23, 1, 0.32, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [value, seen, reduce, duration]);
  // The final text is in the markup for screen readers and holds the width, so the row never jumps while counting.
  return (
    <span ref={ref} className="count-up">
      <span aria-hidden className="count-up-run">{format(shown)}</span>
      <span className="count-up-final">{format(value)}</span>
    </span>
  );
}
