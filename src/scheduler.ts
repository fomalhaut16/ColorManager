import type { ApplyResult } from './settingsWriter';

// Decides when to apply (plan section 10). Time and timers are injected so the
// logic can be tested with a fake clock.

export interface ApplyKey {
  /** Changes whenever the payload would change: hue, mode, slots, tint, version. */
  key: string;
  /** Changes only when the time slot changes (used to add jitter). */
  slot: string;
}

export interface SchedulerDeps {
  now(): number;
  random(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  currentKey(): ApplyKey;
  run(): Promise<ApplyResult>;
  onResult(result: ApplyResult, consecutiveFailures: number): void;
}

export const TICK_MS = 60_000;
export const BACKOFF_MINUTES = [1, 2, 4, 8, 15] as const;
export const SLOT_JITTER_MS = 5_000;

export class Scheduler {
  private lastApplied: ApplyKey | undefined;
  private timer: unknown;
  private running = false;
  private rerun = false;
  private failures = 0;
  private backoffUntil = 0;

  constructor(private readonly d: SchedulerDeps) {}

  /** Called every TICK_MS and when the window regains focus. */
  tick(maxJitterMs = SLOT_JITTER_MS): void {
    if (this.d.now() < this.backoffUntil) return;
    const k = this.d.currentKey();
    if (this.lastApplied?.key === k.key) return;
    const slotChanged = this.lastApplied !== undefined && this.lastApplied.slot !== k.slot;
    this.trigger(slotChanged ? Math.floor(this.d.random() * maxJitterMs) : 0);
  }

  /** Apply after `delayMs`, replacing any pending trigger. */
  trigger(delayMs: number): void {
    if (this.timer !== undefined) this.d.clearTimer(this.timer);
    this.timer = this.d.setTimer(() => {
      this.timer = undefined;
      void this.execute();
    }, delayMs);
  }

  /** Apply Now: ignore backoff and apply immediately. */
  force(): void {
    this.backoffUntil = 0;
    this.trigger(0);
  }

  /** Forget the last applied key so the next tick applies again. */
  invalidate(): void {
    this.lastApplied = undefined;
  }

  consecutiveFailures(): number {
    return this.failures;
  }

  backoffRemainingMs(): number {
    return Math.max(0, this.backoffUntil - this.d.now());
  }

  private async execute(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    const k = this.d.currentKey();
    let result: ApplyResult;
    try {
      result = await this.d.run();
    } catch (e) {
      result = { status: 'failed', reason: String(e) };
    }
    switch (result.status) {
      case 'written':
      case 'unchanged':
        this.lastApplied = k;
        this.failures = 0;
        this.backoffUntil = 0;
        break;
      case 'invalid':
        // A bug, not a transient problem: do not retry this key every minute.
        this.lastApplied = k;
        break;
      case 'failed': {
        this.failures += 1;
        const minutes = BACKOFF_MINUTES[Math.min(this.failures, BACKOFF_MINUTES.length) - 1]!;
        this.backoffUntil = this.d.now() + minutes * 60_000;
        break;
      }
      case 'skipped':
      case 'blocked':
        // Retried by the next tick because lastApplied is unchanged.
        break;
    }
    this.d.onResult(result, this.failures);
    this.running = false;
    if (this.rerun) {
      this.rerun = false;
      this.trigger(0);
    }
  }
}
