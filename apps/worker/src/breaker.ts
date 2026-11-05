/**
 * Stops a run when Kaspi starts refusing us, so we never hammer a site that is pushing back. The first 403/429
 * stops it (CLAUDE.md rule 6), from any request: a check, a re-check or an alert confirmation.
 * Responses we could not read (`unreadable`) are our parser's problem, not Kaspi refusing: they only stop the run
 * when most products fail that way, which means Kaspi changed its format and every further request is wasted.
 */
export class CircuitBreaker {
  checked = 0;
  failed = 0;
  blocked = 0;
  unreadable = 0;
  constructor(private maxFailShare = 0.2, private minSample = 10, private maxBlocked = 1, private maxUnreadableShare = 0.5, private minUnreadableSample = 20) {}
  record(ok: boolean, blocking = false, unreadable = false) {
    this.checked++;
    if (!ok) this.failed++;
    if (blocking) this.blocked++;
    if (!ok && unreadable) this.unreadable++;
  }
  /** A response that refused us outside a counted check (an alert confirmation): stops the run, adds no check. */
  blockedOnce() {
    this.blocked++;
  }
  get openReason(): string | null {
    if (this.blocked >= this.maxBlocked) return `blocked: ${this.blocked} response(s) were 403/429`;
    const otherFailed = this.failed - this.unreadable;
    if (this.checked >= this.minSample && otherFailed / this.checked > this.maxFailShare)
      return `failure share ${(100 * otherFailed / this.checked).toFixed(0)}% over ${this.checked} checks`;
    if (this.checked >= this.minUnreadableSample && this.unreadable / this.checked > this.maxUnreadableShare)
      return `unreadable share ${(100 * this.unreadable / this.checked).toFixed(0)}% over ${this.checked} checks: Kaspi's format may have changed`;
    return null;
  }
}
