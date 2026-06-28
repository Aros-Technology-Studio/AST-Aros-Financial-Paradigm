// 3.7 / XI / XVI — Reserve Logic: AST own capitalization from confirmed work (reserveIndex)
import { log10 } from './util.js';

export class Reserve {
  private totalProcessVolume = 0;

  addConfirmedVolume(amount: number) { this.totalProcessVolume += amount; } // only PoT-confirmed (I-RS-1)
  get volume(): number { return this.totalProcessVolume; }
  reserveIndex(): number { return log10(1 + this.totalProcessVolume); }     // soft log growth (§6)
}
