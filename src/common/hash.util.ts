// Shared deterministic primitives mirroring reference/ast-core/src/util.ts.
// These functions are pure: identical input yields identical output (supports invariant I4).

import { createHash } from 'node:crypto';

/** Returns the hex-encoded SHA-256 digest of a string. Used to hash-link NodeChain records. */
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Returns the base-10 logarithm of a number. Used by tokenomics computations. */
export const log10 = (x: number): number => Math.log10(x);
