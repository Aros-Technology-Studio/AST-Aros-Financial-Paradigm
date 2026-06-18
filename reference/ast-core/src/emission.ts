// 3.4 / VI — Emission Engine: mint on PoT-verified, burn on completion; no emission without PoT (P5, 14.1/14.5)
import { ArosCoin } from './aroscoin.js';

export class Emission {
  constructor(private coin: ArosCoin) {}

  // mint allowed iff authorized by PoT verdict (I-EM-2). Refusing otherwise = invariant 14.1.
  mint(processId: string, amount: number, authorized: boolean): number {
    if (!authorized) throw new Error(`14.1 violation: mint refused for ${processId} — no PoT confirmation`);
    this.coin.recordMint(amount);
    return amount;
  }

  // burn the process part on cycle completion (symmetry I-EM-3)
  burn(processId: string, amount: number): number {
    this.coin.recordBurn(amount);
    return amount;
  }
}
