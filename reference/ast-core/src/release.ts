// 3.8 / XII — Release Mechanism: activate broader circulation on maturity (P7 gate)
export class Release {
  private active = false;
  readonly threshold: number;
  readonly target: number;
  constructor(threshold = 3, target = 0.1) { this.threshold = threshold; this.target = target; }

  // release_condition = reserveIndex > threshold AND velocity > target (I-RL-1, deterministic I-RL-2)
  check(reserveIndex: number, velocity: number): { mature: boolean; active: boolean } {
    const mature = reserveIndex > this.threshold && velocity > this.target;
    if (mature) this.active = true;
    return { mature, active: this.active };
  }
  get isActive(): boolean { return this.active; }
}
