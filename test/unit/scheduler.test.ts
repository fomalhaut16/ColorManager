import { describe, expect, it } from 'vitest';
import { Scheduler, type ApplyKey } from '../../src/scheduler';
import type { ApplyResult, ApplyStatus } from '../../src/settingsWriter';

class FakeClock {
  t = 0;
  timers: Array<{ at: number; fn: () => void; id: number }> = [];
  private next = 1;
  set(fn: () => void, ms: number) {
    const id = this.next++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }
  clear(id: unknown) {
    this.timers = this.timers.filter((x) => x.id !== id);
  }
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const due = this.timers[0];
      if (!due || due.at > end) break;
      this.timers.shift();
      this.t = due.at;
      due.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.t = end;
  }
}

function setup(statuses: ApplyStatus[] = []) {
  const clock = new FakeClock();
  let key: ApplyKey = { key: 'k0', slot: 's0' };
  const runs: string[] = [];
  const results: Array<[ApplyResult, number]> = [];
  const s = new Scheduler({
    now: () => clock.t,
    random: () => 0.5,
    setTimer: (fn, ms) => clock.set(fn, ms),
    clearTimer: (h) => clock.clear(h),
    currentKey: () => key,
    run: async () => {
      runs.push(key.key);
      return { status: statuses.shift() ?? 'written', reason: '' };
    },
    onResult: (r, n) => void results.push([r, n]),
  });
  return { clock, s, runs, results, setKey: (k: ApplyKey) => (key = k) };
}

describe('Scheduler', () => {
  it('applies once per key', async () => {
    const h = setup();
    h.s.tick();
    await h.clock.advance(0);
    h.s.tick();
    await h.clock.advance(0);
    expect(h.runs).toEqual(['k0']);
  });

  it('adds jitter only when the slot changes', async () => {
    const h = setup();
    h.s.tick();
    await h.clock.advance(0);
    h.setKey({ key: 'k1', slot: 's1' });
    h.s.tick();
    await h.clock.advance(2000);
    expect(h.runs).toEqual(['k0']);
    await h.clock.advance(600);
    expect(h.runs).toEqual(['k0', 'k1']);
    h.setKey({ key: 'k2', slot: 's1' }); // e.g. tint changed
    h.s.tick();
    await h.clock.advance(0);
    expect(h.runs).toEqual(['k0', 'k1', 'k2']);
  });

  it('retries skipped and blocked rounds on the next tick', async () => {
    const h = setup(['skipped', 'blocked']);
    for (let i = 0; i < 3; i++) {
      h.s.tick();
      await h.clock.advance(0);
    }
    expect(h.runs).toEqual(['k0', 'k0', 'k0']);
    h.s.tick();
    await h.clock.advance(0);
    expect(h.runs.length).toBe(3); // written on the third run
  });

  it('backs off after failures and reports the streak', async () => {
    const h = setup(['failed', 'failed', 'failed', 'written']);
    h.s.tick();
    await h.clock.advance(0);
    expect(h.s.backoffRemainingMs()).toBe(60_000);
    h.s.tick();
    await h.clock.advance(0);
    expect(h.runs.length).toBe(1); // still backing off
    await h.clock.advance(60_000);
    h.s.tick();
    await h.clock.advance(0);
    expect(h.s.backoffRemainingMs()).toBe(120_000);
    await h.clock.advance(120_000);
    h.s.tick();
    await h.clock.advance(0);
    expect(h.results.at(-1)![1]).toBe(3);
    h.s.force();
    await h.clock.advance(0);
    expect(h.results.at(-1)![0].status).toBe('written');
    expect(h.s.consecutiveFailures()).toBe(0);
  });

  it('does not retry an invalid payload for the same key', async () => {
    const h = setup(['invalid']);
    h.s.tick();
    await h.clock.advance(0);
    h.s.tick();
    await h.clock.advance(0);
    expect(h.runs).toEqual(['k0']);
  });

  it('debounces repeated triggers', async () => {
    const h = setup();
    h.s.trigger(500);
    h.s.trigger(500);
    h.s.trigger(500);
    await h.clock.advance(500);
    expect(h.runs).toEqual(['k0']);
  });
});
