// 3.x / VIII — Nodes: register, execute, validate, earn; influence from work+reputation, NOT stake (P6, 14.6)
import { NodeEntity, NodeType } from './types.js';

export class Nodes {
  private registry = new Map<string, NodeEntity>();

  register(id: string, type: NodeType, uptime = 0.99): NodeEntity {
    const n: NodeEntity = { id, type, metrics: { uptime, successes: 0, total: 0 }, status: 'active', reputation: 0, weight: 0, earned: 0 };
    this.registry.set(id, n);
    return n;
  }

  // record a unit of confirmed work for a node and refresh reputation/weight
  recordWork(id: string, success: boolean) {
    const n = this.registry.get(id); if (!n) return;
    n.metrics.total += 1; if (success) n.metrics.successes += 1;
    n.reputation = (n.metrics.successes / n.metrics.total) * n.metrics.uptime; // nodeReputation
    n.weight = n.reputation * n.metrics.total; // weight grows with reputation & participation
  }

  // penalty hits reputation/admission, never a locked stake (I-ND-4)
  penalize(id: string) {
    const n = this.registry.get(id); if (!n) return;
    n.reputation *= 0.5; n.weight *= 0.5; n.status = 'penalized';
  }

  list(): NodeEntity[] { return [...this.registry.values()]; }
  get(id: string): NodeEntity | undefined { return this.registry.get(id); }
}
