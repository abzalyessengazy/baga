/** Stops a run when Kaspi starts refusing us, so we never hammer a site that is pushing back. */
export class CircuitBreaker {
  checked = 0;
  failed = 0;
  blocked = 0;
  constructor(private maxFailShare = 0.2, private minSample = 10, private maxBlocked = 2) {}
  record(ok: boolean, blocking = false) {
    this.checked++;
    if (!ok) this.failed++;
    if (blocking) this.blocked++;
  }
  get openReason(): string | null {
    if (this.blocked >= this.maxBlocked) return `blocked: ${this.blocked} responses were 403/429`;
    if (this.checked >= this.minSample && this.failed / this.checked > this.maxFailShare)
      return `failure share ${(100 * this.failed / this.checked).toFixed(0)}% over ${this.checked} checks`;
    return null;
  }
}
