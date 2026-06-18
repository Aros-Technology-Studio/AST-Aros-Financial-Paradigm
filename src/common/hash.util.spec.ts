import { sha256, log10 } from './hash.util';

/**
 * hash.util provides the shared deterministic primitives that NodeChain hashing and the
 * tokenomics reserve index rely on. These specs pin both functions to known values and to the
 * determinism property that underpins invariant I4 (identical input -> identical output).
 */
describe('hash.util', () => {
    describe('sha256', () => {
        it('matches the known SHA-256 digest of the empty string', () => {
            expect(sha256('')).toBe(
                'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            );
        });

        it('matches the known SHA-256 digest of "abc"', () => {
            expect(sha256('abc')).toBe(
                'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
            );
        });

        it('returns a 64-character lowercase hex string', () => {
            expect(sha256('any payload')).toMatch(/^[0-9a-f]{64}$/);
        });

        it('is deterministic: identical input yields identical output (I4)', () => {
            expect(sha256('process.admitted|prev|7')).toBe(sha256('process.admitted|prev|7'));
        });

        it('is sensitive: a single-character change alters the digest', () => {
            expect(sha256('payload-a')).not.toBe(sha256('payload-b'));
        });
    });

    describe('log10', () => {
        it('returns 0 for an input of 1 (basis of an empty reserve index)', () => {
            expect(log10(1)).toBe(0);
        });

        it('returns the exact power for clean powers of ten', () => {
            expect(log10(1000)).toBeCloseTo(3, 12);
            expect(log10(1_000_000)).toBeCloseTo(6, 12);
        });

        it('grows monotonically with its input (supports reserve monotonicity)', () => {
            expect(log10(10)).toBeLessThan(log10(100));
        });
    });
});
