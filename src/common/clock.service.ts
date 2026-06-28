import { Injectable } from '@nestjs/common';

/**
 * Deterministic monotonic clock, mirroring reference/ast-core/src/util.ts `now()`.
 *
 * Each call to `now()` pre-increments and returns an internal counter that starts
 * at 1_700_000_000_000. Because the sequence depends only on call order, every run
 * reproduces the same timestamps, which keeps execution deterministic (invariant I4).
 *
 * Provided once via CommonModule so all feature modules share a single counter.
 */
@Injectable()
export class ClockService {
    private t = 1_700_000_000_000;

    /** Returns the next strictly increasing tick. */
    now(): number {
        return ++this.t;
    }
}
