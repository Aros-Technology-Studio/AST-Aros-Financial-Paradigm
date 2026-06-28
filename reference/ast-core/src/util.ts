import { createHash } from 'node:crypto';
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const log10 = (x: number): number => Math.log10(x);
export const now = (() => { let t = 1_700_000_000_000; return () => ++t; })(); // deterministic clock for demo
