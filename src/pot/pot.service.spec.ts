import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommonModule } from '../common/common.module';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodeChainService } from '../nodechain/nodechain.service';
import { StateRecordingModule } from '../state-recording/state-recording.module';
import { StateRecordingService } from '../state-recording/state-recording.service';
import { PotVerdict } from './entities/pot-verdict.entity';
import { PotModule } from './pot.module';
import { PotService } from './pot.service';

/**
 * Specs exercise the PoT verdict engine against a real TypeORM stack backed by an
 * in-memory SQLite database. They assert the value gate (I1), determinism (I4), the
 * one-verdict-per-process rule, and that every verdict is recorded in NodeChain.
 *
 * `dropSchema: true` gives every test a clean verdict table and a fresh chain.
 */
describe('PotService', () => {
    let moduleRef: TestingModule;
    let service: PotService;
    let recording: StateRecordingService;
    let chain: NodeChainService;
    let verdictRepo: Repository<PotVerdict>;

    /** Record the full required execution sequence for a process, matching the orchestrator. */
    async function recordFullSequence(processId: string): Promise<void> {
        await recording.capture(processId, 'initiation', { amount: 100 });
        await recording.capture(processId, 'task_assignment', { nodes: ['node-1'] });
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
                    entities: [ExecutionSnapshot, PotVerdict],
                    synchronize: true,
                    logging: false,
                }),
                NodeChainModule,
                StateRecordingModule,
                PotModule,
            ],
        }).compile();

        service = moduleRef.get(PotService);
        recording = moduleRef.get(StateRecordingService);
        chain = moduleRef.get(NodeChainService);
        verdictRepo = moduleRef.get<Repository<PotVerdict>>(getRepositoryToken(PotVerdict));
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I1: a fully recorded process verifies, granting value the right to exist.
    it('I1: all required events captured -> verified:1 with empty reasons', async () => {
        await recordFullSequence('p-1');

        const result = await service.verify('p-1');

        expect(result.verified).toBe(1);
        expect(result.reasons).toEqual([]);
    });

    // I1: an incomplete process mints nothing — the verdict is 0 and names the gaps.
    it('I1: missing events -> verified:0 with reasons naming the missing event types', async () => {
        await recording.capture('p-2', 'initiation', { amount: 100 });
        await recording.capture('p-2', 'task_assignment', { nodes: ['node-1'] });
        // stage_transition and execution_complete are intentionally never recorded.

        const result = await service.verify('p-2');

        expect(result.verified).toBe(0);
        expect(result.reasons).toEqual(
            expect.arrayContaining([
                'missing_event:stage_transition',
                'missing_event:execution_complete',
            ]),
        );
        expect(result.reasons).not.toContain('missing_event:initiation');
    });

    // The verdict is persisted as its own row in the PotVerdict table.
    it('persists the verdict in the PotVerdict table', async () => {
        await recordFullSequence('p-3');
        await service.verify('p-3');

        const stored = await verdictRepo.findOne({ where: { processId: 'p-3' } });
        expect(stored).not.toBeNull();
        expect(stored?.verified).toBe(1);
        expect(stored?.reasons).toEqual([]);

        const viaApi = await service.getVerdict('p-3');
        expect(viaApi?.processId).toBe('p-3');
    });

    // I-PoT-5: the verdict is recorded in NodeChain with the correct payload.
    it("I-PoT-5: a 'pot.verified' snapshot appears in NodeChain with the verdict payload", async () => {
        await recordFullSequence('p-4');
        const result = await service.verify('p-4');

        const head = await chain.latest();
        expect(head?.eventType).toBe('pot.verified');
        expect(head?.payload).toMatchObject({
            processId: 'p-4',
            verified: 1,
            reasons: [],
        });
        expect(head?.sequenceId).toBe(result.snapshotSequenceId);
    });

    // The returned snapshotSequenceId points to the snapshot just written to the chain.
    it("verdict snapshotSequenceId matches the NodeChain snapshot just written", async () => {
        await recordFullSequence('p-5');
        const result = await service.verify('p-5');

        const snapshot = await chain.getBySequence(result.snapshotSequenceId);
        expect(snapshot?.eventType).toBe('pot.verified');
        expect(snapshot?.payload).toMatchObject({ processId: 'p-5' });

        const stored = await verdictRepo.findOne({ where: { processId: 'p-5' } });
        expect(stored?.snapshotSequenceId).toBe(result.snapshotSequenceId);
    });

    // I-PoT-4: verify() is idempotent — a second call returns the stored verdict and
    // writes no second snapshot (no re-confirmation, no double authorization).
    it('I-PoT-4: verify() twice for one process is idempotent', async () => {
        await recordFullSequence('p-6');

        const first = await service.verify('p-6');
        const chainLenAfterFirst = (await chain.list()).length;

        const second = await service.verify('p-6');
        const chainLenAfterSecond = (await chain.list()).length;

        expect(second).toEqual(first);
        expect(chainLenAfterSecond).toBe(chainLenAfterFirst);

        const rows = await verdictRepo.find({ where: { processId: 'p-6' } });
        expect(rows.length).toBe(1);
    });

    // I-PoT-4: capturing more events after a verdict does not change it (verdict is fixed).
    it('I-PoT-4: a verdict is not re-evaluated when later events arrive', async () => {
        await recording.capture('p-7', 'initiation', { amount: 100 });
        const first = await service.verify('p-7');
        expect(first.verified).toBe(0);

        // Complete the sequence after the fact; the existing verdict must stand.
        await recording.capture('p-7', 'task_assignment', {});
        await recording.capture('p-7', 'stage_transition', {});
        await recording.capture('p-7', 'execution_complete', {});

        const second = await service.verify('p-7');
        expect(second).toEqual(first);
        expect(second.verified).toBe(0);
    });

    // I4: identical captured event sets yield identical verdicts across independent processes.
    it('I4: identical evidence produces identical verdicts', async () => {
        await recordFullSequence('det-a');
        await recordFullSequence('det-b');

        const a = await service.verify('det-a');
        const b = await service.verify('det-b');

        expect(a.verified).toBe(b.verified);
        expect(a.reasons).toEqual(b.reasons);
    });

    // A process with no recorded events at all cannot be valued.
    it('I1: an unrecorded process verifies to 0', async () => {
        const result = await service.verify('ghost');
        expect(result.verified).toBe(0);
        expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('list() returns every issued verdict', async () => {
        await recordFullSequence('l-1');
        await recording.capture('l-2', 'initiation', {});
        await service.verify('l-1');
        await service.verify('l-2');

        const all = await service.list();
        expect(all.map((v) => v.processId).sort()).toEqual(['l-1', 'l-2']);
    });
});
