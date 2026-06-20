// 3.5 / VI-VII — Commission Engine: fee, epoch pool, post-factum distribution by weight (P2)
import { ArosCoin } from './aroscoin.js';
import { NodeEntity } from './types.js';

export class Commission {
  private pool = 0;
  private contributions: { processId: string; fee: number }[] = [];
  readonly feeRate = 0.005;   // canonical 0.5% commission rate
  readonly marginRate = 0.25; // canonical 25% AFC reserve share; 75% to nodes

  computeFee(amount: number, overloadRate = 0): number {
    const fee = amount * this.feeRate;
    return fee * (1 + overloadRate); // dynamicFee
  }

  accrue(processId: string, fee: number) { this.pool += fee; this.contributions.push({ processId, fee }); }

  // finalizeEpoch: distribute post-factum by node weight; pool reconciles to zero remainder (I-CM-4)
  finalizeEpoch(nodes: NodeEntity[], coin: ArosCoin) {
    const distributable = this.pool * (1 - this.marginRate);
    const margin = this.pool * this.marginRate;
    const totalWeight = nodes.reduce((s, n) => s + n.weight, 0) || 1;
    const distributionLog: { nodeId: string; payment: number }[] = [];
    let paid = 0;
    for (const n of nodes) {
      const payment = (n.weight * distributable) / totalWeight; // paymentToNode
      n.earned += payment;        // earned retained by node (P6)
      coin.recordEarned(payment);
      paid += payment;
      distributionLog.push({ nodeId: n.id, payment });
    }
    const reconciled = Math.abs((paid + margin) - this.pool) < 1e-9;
    const total = this.pool;
    this.pool = 0;
    return { distributionLog, margin, paid, total, reconciled };
  }
}
