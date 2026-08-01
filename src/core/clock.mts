/**
 * §M-CLOCK — Injectable time source for every deadline in the workflow.
 *
 * Implements §A-DETERMINISTIC-WATCHDOG. Stall deadlines, quota resets and
 * watchdog backoff are the parts most likely to be wrong and the hardest to
 * test against a real clock. Threading a clock through those code paths is what
 * makes their acceptance tests run in milliseconds instead of minutes; without
 * it, backoff behaviour would be asserted by reading the code rather than by
 * executing it.
 */

/** §M-CLOCK — Minimal time surface the workflow depends on. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** §M-CLOCK — Real wall clock used in production. */
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((done) => setTimeout(done, ms)),
};

/**
 * §M-CLOCK — Controllable clock whose `sleep` advances virtual time immediately.
 *
 * Tests can prove that a poll loop backs off exponentially and resets on
 * observed progress without ever waiting; a real sleep would make the same
 * assertions too slow to keep.
 */
export class FakeClock implements Clock {
  /** §M-CLOCK — Virtual now, advanced only by an explicit call. */
  private current: number;

  /** §M-CLOCK — Start virtual time at an explicit epoch so assertions are absolute. */
  constructor(startMs = 0) {
    this.current = startMs;
  }

  /** §M-CLOCK — Current virtual time. */
  now(): number {
    return this.current;
  }

  /** §M-CLOCK — Advance virtual time without yielding to real timers. */
  advance(ms: number): void {
    this.current += ms;
  }

  /** §M-CLOCK — Satisfy a sleep by jumping forward, keeping the async shape intact. */
  async sleep(ms: number): Promise<void> {
    this.current += ms;
    await Promise.resolve();
  }
}

/** §M-CLOCK — RFC 3339 UTC timestamp, the only time format written to state. */
export function isoTimestamp(clock: Clock = systemClock): string {
  return new Date(clock.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
