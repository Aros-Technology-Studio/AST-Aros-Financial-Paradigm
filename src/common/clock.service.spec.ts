import { ClockService } from './clock.service';

describe('ClockService', () => {
    it('is strictly monotonic across calls', () => {
        const clock = new ClockService();
        const a = clock.now();
        const b = clock.now();
        const c = clock.now();
        expect(b).toBeGreaterThan(a);
        expect(c).toBeGreaterThan(b);
    });

    it('is deterministic: a fresh instance reproduces the same sequence', () => {
        const first = new ClockService();
        const second = new ClockService();
        expect(first.now()).toBe(second.now());
        expect(first.now()).toBe(second.now());
        expect(first.now()).toBe(1_700_000_000_003);
    });
});
