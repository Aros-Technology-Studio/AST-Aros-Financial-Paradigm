import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodeChainService } from '../nodechain/nodechain.service';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import {
    REQUIRED_BEFORE_VERDICT,
    StateRecordingService,
} from './state-recording.service';
import { StateRecordingModule } from './state-recording.module';

/**
 * Specs exercise StateRecording's invariant I3 (every significant event recorded in
 * NodeChain) by running the real Nest stack — CommonModule, NodeChainModule, and
 * StateRecordingModule — against an in-memory better-sqlite3 database. Each test starts
 * with a clean schema thanks to `dropSchema: true`.
 */
describe('StateRecordingService', () => {
    let moduleRef: TestingModule;
    let service: StateRecordingService;
    let chain: NodeChainService;

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'better-sqlite3',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [ExecutionSnapshot],
                    synchronize: true,
                    logging: false,
                }),
                CommonModule,
                NodeChainModule,
                StateRecordingModule,
            ],
        }).compile();

        service = moduleRef.get(StateRecordingService);
        chain = moduleRef.get(NodeChainService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I3: capture() persists the event via NodeChain and returns the resulting snapshot.
    it('I3: capture() returns the persisted ExecutionSnapshot', async () => {
        const snap = await service.capture(
            'proc-1',
            'initiation',
            { who: 'orchestrator' },
            null,
        );
        expect(snap).toBeDefined();
        expect(snap.sequenceId).toBe(1);
        expect(snap.eventType).toBe('initiation');
        expect(snap.prevHash).toBe('');
        expect(snap.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    // I3: the captured event is visible through NodeChainService.list().
    it('I3: captured event appears in NodeChainService.list()', async () => {
        const snap = await service.capture('proc-1', 'initiation', { who: 'a' });
        const all = await chain.list();
        expect(all).toHaveLength(1);
        expect(all[0].sequenceId).toBe(snap.sequenceId);
        expect(all[0].hash).toBe(snap.hash);
    });

    // I-SR-4 / I3: eventType and payload survive the pass-through unchanged.
    it("I-SR-4: snapshot's eventType and payload reflect what was recorded", async () => {
        const data = { stage: 'admissibility', amount: 42 };
        const snap = await service.capture('proc-7', 'stage_transition', data, 'node-3');
        expect(snap.eventType).toBe('stage_transition');
        expect(snap.payload).toEqual({
            processId: 'proc-7',
            data: { amount: 42, stage: 'admissibility' },
            validatorId: 'node-3',
        });
    });

    // I3 + I-NC-1: N captures yield N snapshots with strictly increasing sequenceIds.
    it('I3: N captures produce N snapshots with strictly increasing sequenceIds', async () => {
        const ids: number[] = [];
        for (let i = 0; i < 5; i++) {
            const snap = await service.capture('proc-1', `event_${i}`, { i });
            ids.push(snap.sequenceId);
        }
        expect(ids).toEqual([1, 2, 3, 4, 5]);
        const all = await chain.list();
        expect(all.map((s) => s.sequenceId)).toEqual([1, 2, 3, 4, 5]);
    });

    // I4 (determinism): the same logical event produces a reproducible payload hash even when
    // the caller supplies the `data` keys in a different order.
    it('I4: same logical event yields a reproducible payload regardless of input key order', async () => {
        const first = await service.capture(
            'proc-det',
            'initiation',
            { stage: 'init', amount: 7 },
            'node-1',
        );

        // Fresh module so the second recording starts at sequenceId 1 against the same clock.
        await moduleRef.close();
        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'better-sqlite3',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [ExecutionSnapshot],
                    synchronize: true,
                    logging: false,
                }),
                CommonModule,
                NodeChainModule,
                StateRecordingModule,
            ],
        }).compile();
        service = moduleRef.get(StateRecordingService);

        const second = await service.capture(
            'proc-det',
            'initiation',
            { amount: 7, stage: 'init' },
            'node-1',
        );

        expect(second.payload).toEqual(first.payload);
        expect(second.hash).toBe(first.hash);
    });

    // I-SR-1 / I3: checkCompleteness reports the required events that are still missing.
    it('I-SR-1: checkCompleteness reports missing required events', async () => {
        expect(service.checkCompleteness('proc-1')).toEqual({
            complete: false,
            missing: [...REQUIRED_BEFORE_VERDICT],
        });

        await service.capture('proc-1', 'initiation', {});
        await service.capture('proc-1', 'task_assignment', {});

        const result = service.checkCompleteness('proc-1');
        expect(result.complete).toBe(false);
        expect(result.missing).toEqual(['stage_transition', 'execution_complete']);
    });

    // I-SR-1: completeness becomes true exactly when every required event has been captured.
    it('I-SR-1: checkCompleteness returns complete once every required event is captured', async () => {
        for (const eventType of REQUIRED_BEFORE_VERDICT) {
            await service.capture('proc-1', eventType, {});
        }
        expect(service.checkCompleteness('proc-1')).toEqual({
            complete: true,
            missing: [],
        });
    });

    // I-SR-4: capturedEvents() returns a copy so callers cannot mutate the internal index.
    it('I-SR-4: capturedEvents() returns an isolated copy of the captured set', async () => {
        await service.capture('proc-1', 'initiation', {});
        const snapshot = service.capturedEvents('proc-1');
        snapshot.add('forged');
        expect(service.capturedEvents('proc-1').has('forged')).toBe(false);
    });

    // record() is an alias for capture() per the entity spec's `record(event)` operation.
    it('record() delegates to capture() and returns the persisted snapshot', async () => {
        const snap = await service.record('proc-1', 'initiation', { ok: true });
        expect(snap.sequenceId).toBe(1);
        expect(service.capturedEvents('proc-1').has('initiation')).toBe(true);
    });
});
