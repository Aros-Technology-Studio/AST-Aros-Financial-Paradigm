import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { ArosCoinLedger } from '../aroscoin/entities/aroscoin-ledger.entity';
import { CommonModule } from '../common/common.module';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodeChainService } from '../nodechain/nodechain.service';
import { NodeEntity } from '../nodes/entities/node.entity';
import { NodesModule } from '../nodes/nodes.module';
import { NodesService } from '../nodes/nodes.service';
import { PotVerdict } from '../pot/entities/pot-verdict.entity';
import { PotModule } from '../pot/pot.module';
import { StateRecordingModule } from '../state-recording/state-recording.module';
import { StateRecordingService } from '../state-recording/state-recording.service';
import { CommissionModule } from './commission.module';
import { CommissionService } from './commission.service';
import { DistributionEntry, Epoch } from './entities/epoch.entity';

/**
 * Commission specs exercise the settlement controller against a real TypeORM stack on an
 * in-memory SQLite database. They assert pool reconciliation (I7), proportional payment by
 * weight (I-CM-3), the PoT gate on participation (P2/I2), the no-payment-for-presence rule
 * (I-CM-5), distribution recording in NodeChain, and determinism (I4).
 */
describe('CommissionService', () => {
    let moduleRef: TestingModule;
    let service: CommissionService;
    let nodes: NodesService;
    let recording: StateRecordingService;
    let chain: NodeChainService;

    const EPSILON = 1e-9;

    /** Record the full required execution sequence so a process verifies to 1. */
    async function recordFullSequence(processId: string): Promise<void> {
        await recording.capture(processId, 'initiation', { amount: 100 });
        await recording.capture(processId, 'task_assignment', { nodes: ['node'] });
        await recording.capture(processId, 'stage_transition', { stage: 'execute' });
        await recording.capture(processId, 'execution_complete', {});
    }

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                CommonModule,
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [ExecutionSnapshot, PotVerdict, NodeEntity, ArosCoinLedger, Epoch],
                    synchronize: true,
                    logging: false,
                }),
                NodeChainModule,
                StateRecordingModule,
                NodesModule,
                PotModule,
                ArosCoinModule,
                CommissionModule,
            ],
        }).compile();

        service = moduleRef.get(CommissionService);
        nodes = moduleRef.get(NodesService);
        recording = moduleRef.get(StateRecordingService);
        chain = moduleRef.get(NodeChainService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // computeFee: fee = amount * feeRate (canonical 0.5%).
    it('computeFee returns amount * feeRate', () => {
        expect(service.computeFee(1000)).toBeCloseTo(5, 9);         // 1000 * 0.005
        expect(service.computeFee(1000, 0.5)).toBeCloseTo(7.5, 9); // dynamicFee: 5 * 1.5
    });

    // I7: after finalize, Σ(payments) + operationalMargin == Σ(fees) for the epoch.
    it('I7: pool reconciles — Σ(payments) + margin == Σ(fees)', async () => {
        await nodes.register('n1', 'worker');
        await nodes.register('n2', 'worker');
        await recording.capture('proc', 'initiation', { amount: 100 });
        await recording.capture('proc', 'task_assignment', {});
        await recording.capture('proc', 'stage_transition', {});
        await recording.capture('proc', 'execution_complete', {});
        const pot = moduleRef.get(require('../pot/pot.service').PotService);
        await pot.verify('proc');

        const fee = service.computeFee(100); // 1
        await service.accrue(1, fee, [
            { processId: 'proc', nodeId: 'n1' },
            { processId: 'proc', nodeId: 'n2' },
        ]);

        const result = await service.finalizeEpoch(1);

        expect(result.reconciled).toBe(true);
        expect(result.paid + result.operationalMargin).toBeCloseTo(result.totalFees, 9);
        expect(Math.abs(result.paid + result.operationalMargin - fee)).toBeLessThan(EPSILON);
    });

    // I-CM-3: payment is proportional to node weight.
    it('I-CM-3: payment proportional to node weight', async () => {
        const pot = moduleRef.get(require('../pot/pot.service').PotService);
        await nodes.register('strong', 'worker');
        await nodes.register('weak', 'worker');
        // Give 'strong' a higher weight via more confirmed work; 'weak' less.
        await nodes.recordExecution('strong', true);
        await nodes.recordExecution('strong', true);
        await nodes.recordExecution('weak', true);
        await nodes.recordExecution('weak', false); // reputation 0.5 -> weight 0.5

        await recordFullSequence('p');
        await pot.verify('p');

        await service.accrue(1, 100, [
            { processId: 'p', nodeId: 'strong' },
            { processId: 'p', nodeId: 'weak' },
        ]);
        const result = await service.finalizeEpoch(1);

        const strongPay = result.distributionLog.find((e) => e.nodeId === 'strong')!.amount;
        const weakPay = result.distributionLog.find((e) => e.nodeId === 'weak')!.amount;
        const wStrong = await nodes.currentWeight('strong'); // 1
        const wWeak = await nodes.currentWeight('weak'); // 0.5
        expect(strongPay / weakPay).toBeCloseTo(wStrong / wWeak, 6);
    });

    // P2/I2: a node whose participation is in an unverified process receives nothing.
    it('P2/I2: participation without a PoT verdict earns nothing', async () => {
        const pot = moduleRef.get(require('../pot/pot.service').PotService);
        await nodes.register('confirmed', 'worker');
        await nodes.register('unconfirmed', 'worker');

        await recordFullSequence('verified-proc');
        await pot.verify('verified-proc');

        // 'bad-proc' has only a partial sequence -> verdict 0.
        await recording.capture('bad-proc', 'initiation', { amount: 50 });
        await pot.verify('bad-proc');

        await service.accrue(1, 100, [
            { processId: 'verified-proc', nodeId: 'confirmed' },
            { processId: 'bad-proc', nodeId: 'unconfirmed' },
        ]);
        const result = await service.finalizeEpoch(1);

        const unconfirmed = result.distributionLog.find((e) => e.nodeId === 'unconfirmed');
        expect(unconfirmed).toBeUndefined();
        const confirmed = result.distributionLog.find((e) => e.nodeId === 'confirmed')!;
        expect(confirmed.amount).toBeGreaterThan(0);
        expect(result.reconciled).toBe(true);
    });

    // I-CM-5: a registered but non-participating node is paid nothing for presence.
    it('I-CM-5: no payment for presence — a non-participating node earns nothing', async () => {
        const pot = moduleRef.get(require('../pot/pot.service').PotService);
        await nodes.register('active', 'worker');
        await nodes.register('idle', 'worker'); // present, but never participates

        await recordFullSequence('p');
        await pot.verify('p');

        await service.accrue(1, 100, [{ processId: 'p', nodeId: 'active' }]);
        const result = await service.finalizeEpoch(1);

        expect(result.distributionLog.find((e) => e.nodeId === 'idle')).toBeUndefined();
        expect(result.distributionLog.find((e) => e.nodeId === 'active')).toBeDefined();
    });

    // Distribution is recorded in the append-only NodeChain.
    it('records the distribution in NodeChain', async () => {
        const pot = moduleRef.get(require('../pot/pot.service').PotService);
        await nodes.register('n1', 'worker');
        await recordFullSequence('p');
        await pot.verify('p');

        await service.accrue(1, 100, [{ processId: 'p', nodeId: 'n1' }]);
        await service.finalizeEpoch(1);

        const head = await chain.latest();
        expect(head?.eventType).toBe('commission.epoch.finalized');
        expect(head?.payload).toMatchObject({ epochNumber: 1, reconciled: true });

        // The node payment receipt is also on-chain.
        const events = (await chain.list()).map((s) => s.eventType);
        expect(events).toContain('node.payment.received');
    });

    // I4: identical inputs yield identical distributions across two independent stacks.
    it('I4: same inputs produce the same distribution', async () => {
        async function run(): Promise<DistributionEntry[]> {
            const ref = await Test.createTestingModule({
                imports: [
                    CommonModule,
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        dropSchema: true,
                        entities: [ExecutionSnapshot, PotVerdict, NodeEntity, ArosCoinLedger, Epoch],
                        synchronize: true,
                        logging: false,
                    }),
                    NodeChainModule,
                    StateRecordingModule,
                    NodesModule,
                    PotModule,
                    ArosCoinModule,
                    CommissionModule,
                ],
            }).compile();
            const svc = ref.get(CommissionService);
            const nd = ref.get(NodesService);
            const rec = ref.get(StateRecordingService);
            const pt = ref.get(require('../pot/pot.service').PotService);

            await nd.register('a', 'worker');
            await nd.register('b', 'worker');
            await nd.recordExecution('a', true);
            await rec.capture('p', 'initiation', { amount: 100 });
            await rec.capture('p', 'task_assignment', {});
            await rec.capture('p', 'stage_transition', {});
            await rec.capture('p', 'execution_complete', {});
            await pt.verify('p');
            await svc.accrue(1, 100, [
                { processId: 'p', nodeId: 'a' },
                { processId: 'p', nodeId: 'b' },
            ]);
            const r = await svc.finalizeEpoch(1);
            await ref.close();
            return r.distributionLog;
        }

        const distribution = await run();
        const again = await run();
        expect(again).toEqual(distribution);
    });

    // list() returns every epoch in ascending order.
    it('list returns all epochs in ascending order', async () => {
        await service.accrue(2, 5);
        await service.accrue(1, 10);
        const epochs = await service.list();
        expect(epochs.map((e) => e.epochNumber)).toEqual([1, 2]);
    });

    // Finalizing an already-finalized epoch is idempotent: it re-derives the stored result
    // without paying again or appending a second distribution to NodeChain.
    it('re-finalizing a finalized epoch returns the stored result without paying again', async () => {
        const pot = moduleRef.get(require('../pot/pot.service').PotService);
        await nodes.register('n1', 'worker');
        await recordFullSequence('p');
        await pot.verify('p');
        await service.accrue(1, 100, [{ processId: 'p', nodeId: 'n1' }]);

        const first = await service.finalizeEpoch(1);
        const chainLenAfterFirst = (await chain.list()).length;

        const second = await service.finalizeEpoch(1);

        expect(second.epochNumber).toBe(first.epochNumber);
        expect(second.paid).toBeCloseTo(first.paid, 9);
        expect(second.operationalMargin).toBeCloseTo(first.operationalMargin, 9);
        expect(second.reconciled).toBe(true);
        // No second distribution snapshot was appended.
        expect((await chain.list()).length).toBe(chainLenAfterFirst);
    });

    // Finalizing an epoch that was never opened is a not-found condition.
    it('finalizing an unknown epoch throws NotFoundException', async () => {
        await expect(service.finalizeEpoch(999)).rejects.toThrow('Epoch 999 does not exist');
    });
});
