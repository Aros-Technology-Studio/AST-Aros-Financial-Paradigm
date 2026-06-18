// IV — Process lifecycle orchestrator: wires all entities into the full Model-1 loop
import { NodeChain } from './nodechain.js';
import { StateRecording } from './stateRecording.js';
import { PoT } from './pot.js';
import { ArosCoin } from './aroscoin.js';
import { Emission } from './emission.js';
import { Commission } from './commission.js';
import { Reserve } from './reserve.js';
import { Release } from './release.js';
import { Nodes } from './nodes.js';
import { AllSeeingEye } from './allSeeingEye.js';
import { ProcessRequest } from './types.js';

export class AST {
  chain = new NodeChain();
  sr = new StateRecording(this.chain);
  pot = new PoT();
  coin = new ArosCoin();
  emission = new Emission(this.coin);
  commission = new Commission();
  reserve = new Reserve();
  release = new Release();
  nodes = new Nodes();
  eye = new AllSeeingEye();

  constructor() {
    this.nodes.register('node-1', 'validator');
    this.nodes.register('node-2', 'router');
    this.nodes.register('node-3', 'recorder');
  }

  // Full lifecycle (ch. IV): initiation -> admissibility -> assignment -> execution ->
  // PoT verify -> emission -> fee accrue -> reserve -> burn -> final record; Eye observes throughout.
  runProcess(req: ProcessRequest) {
    this.sr.capture(req.id, 'initiation', { amount: req.amount });
    this.eye.observe('processing', 'initiation', `process ${req.id} initiated (amount ${req.amount})`);

    if (!req.admissible) {
      this.eye.observe('processing', 'anomaly_detected', `process ${req.id} inadmissible — rejected`);
      return { processId: req.id, verified: false, reason: 'inadmissible' as const };
    }

    const assigned = this.nodes.list().filter(n => n.status === 'active');
    this.sr.capture(req.id, 'task_assignment', { nodes: assigned.map(n => n.id) });
    this.eye.observe('processing', 'task_assignment', `assigned to ${assigned.length} nodes`);

    this.sr.capture(req.id, 'stage_transition', { stage: 'execute' });
    this.sr.capture(req.id, 'execution_complete', {});
    assigned.forEach(n => this.nodes.recordWork(n.id, true));

    const chainOk = this.chain.reconstruct().ok;
    const verdict = this.pot.verify(req, this.sr.capturedEvents(req.id), chainOk, this.chain.height - 1);
    this.sr.capture(req.id, 'pot_verdict', { verified: verdict.verified });
    this.eye.observe('processing', 'pot_verdict', `process ${req.id} verified=${verdict.verified}`);
    if (!verdict.verified) return { processId: req.id, verified: false, reason: 'unverified' as const };

    const minted = this.emission.mint(req.id, req.amount, this.pot.authorizeEmission(req.id));
    this.sr.capture(req.id, 'emission', { minted });
    this.eye.observe('token_management', 'mint', `minted ${minted} for ${req.id}`);

    const fee = this.commission.computeFee(req.amount);
    this.commission.accrue(req.id, fee);
    this.reserve.addConfirmedVolume(req.amount);

    this.emission.burn(req.id, minted); // process part burns
    this.sr.capture(req.id, 'emission_burn', { burned: minted });
    this.eye.observe('token_management', 'burn', `burned ${minted} for ${req.id}`);

    this.sr.capture(req.id, 'final_status', { status: 'done' });
    this.eye.observe('ledger_anchoring', 'final_status', `process ${req.id} finalized`);
    this.eye.compareSupply(this.coin.snapshot());

    return { processId: req.id, verified: true, minted, fee };
  }

  finalizeEpoch() {
    const res = this.commission.finalizeEpoch(this.nodes.list(), this.coin);
    this.eye.observe('token_management', 'commission_distribution',
      `epoch: paid ${res.paid.toFixed(4)}, margin ${res.margin.toFixed(4)}, reconciled=${res.reconciled}`);
    this.eye.compareSupply(this.coin.snapshot());
    return res;
  }

  metrics() {
    const reserveIndex = this.reserve.reserveIndex();
    const supply = this.coin.totalSupply();
    const velocity = this.coin.retained > 0 ? this.reserve.volume / this.coin.retained : 0;
    const release = this.release.check(reserveIndex, velocity);
    return { reserveIndex, velocity, internalPrice: this.coin.internalPrice(reserveIndex), supply, retained: this.coin.retained, release };
  }
}
