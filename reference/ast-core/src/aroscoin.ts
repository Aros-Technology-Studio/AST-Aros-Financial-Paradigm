// 3.3 / V — ArosCoin: process unit of account; tracks supply (process vs earned), internal price
import { SupplySnapshot } from './types.js';
import { log10, now } from './util.js';

export class ArosCoin {
  private processMinted = 0;
  private processBurned = 0;
  private earnedRetained = 0;
  readonly base = 1;

  recordMint(amount: number) { this.processMinted += amount; }
  recordBurn(amount: number) { this.processBurned += amount; }
  recordEarned(amount: number) { this.earnedRetained += amount; }

  // totalSupply = (processMinted - processBurned) + earnedRetained ; derivable (I-AC-5)
  totalSupply(): number { return (this.processMinted - this.processBurned) + this.earnedRetained; }
  processNet(): number { return this.processMinted - this.processBurned; } // -> 0 for completed
  get retained(): number { return this.earnedRetained; }

  // internalPrice = base * reserveIndex (§8) — value from accumulated work, not market
  internalPrice(reserveIndex: number): number { return this.base * reserveIndex; }

  snapshot(): SupplySnapshot {
    return { processMinted: this.processMinted, processBurned: this.processBurned, earnedRetained: this.earnedRetained, timestamp: now() };
  }
}
