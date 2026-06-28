import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClockService } from '../common/clock.service';
import { sha256 } from '../common/hash.util';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import { NodeChainService } from '../nodechain/nodechain.service';
import { OversightLogEntry } from './entities/oversight-log-entry.entity';
import { AllSeeingEyeService } from './all-seeing-eye.service';

/**
 * Specs exercise the All-Seeing Eye against a real TypeORM stack backed by an
 * in-memory SQLite database. They confirm the Eye's canonical posture as a
 * passive witness (I10) and its non-enforcement surface (P6): every operation
 * either reads or appends to the Oversight Ledger, and the Eye exposes no
 * method capable of changing application state elsewhere.
 */
describe('AllSeeingEyeService', () => {
    let moduleRef: TestingModule;
    let service: AllSeeingEyeService;
    let nodeChain: NodeChainService;
    let oversightRepo: Repository<OversightLogEntry>;

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [ExecutionSnapshot, OversightLogEntry],
                    synchronize: true,
                    logging: false,
                }),
                TypeOrmModule.forFeature([ExecutionSnapshot, OversightLogEntry]),
            ],
            providers: [ClockService, NodeChainService, AllSeeingEyeService],
        }).compile();

        service = moduleRef.get(AllSeeingEyeService);
        nodeChain = moduleRef.get(NodeChainService);
        oversightRepo = moduleRef.get<Repository<OversightLogEntry>>(
            getRepositoryToken(OversightLogEntry),
        );
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I10: consistent observation is a quiet witness; no anomaly recorded.
    it('I10: compareSupply with totalSupply === retained returns consistent and writes no anomaly', async () => {
        const result = await service.compareSupply({ totalSupply: 100, retained: 100 });
        expect(result).toEqual({ consistent: true });

        const entries = await service.getLog();
        const anomalies = entries.filter((e) => e.eventType === 'anomaly_detected');
        expect(anomalies).toHaveLength(0);
    });

    // I10: drift triggers a single 'anomaly_detected' entry but no exception.
    it('I10: compareSupply with mismatch returns inconsistent and records an anomaly_detected entry', async () => {
        const result = await service.compareSupply({ totalSupply: 100, retained: 90 });
        expect(result).toEqual({ consistent: false });

        const entries = await service.getLog();
        const anomalies = entries.filter((e) => e.eventType === 'anomaly_detected');
        expect(anomalies).toHaveLength(1);
        expect(anomalies[0].layer).toBe('token_management');
        expect(anomalies[0].description).toContain('100');
        expect(anomalies[0].description).toContain('90');
    });

    // I10: compareSupply must not mutate any state outside the Oversight Ledger.
    it('I10: compareSupply does not mutate NodeChain length (witness, not judge)', async () => {
        await nodeChain.append('seed.event', { kind: 'init' });
        await nodeChain.append('seed.event', { kind: 'progress' });
        const before = await nodeChain.list();

        await service.compareSupply({ totalSupply: 100, retained: 50 });

        const after = await nodeChain.list();
        expect(after.length).toBe(before.length);
        expect(after.map((s) => s.hash)).toEqual(before.map((s) => s.hash));
    });

    // I10: verifyChain reports a healthy chain and leaves NodeChain unchanged.
    it('I10: verifyChain on a clean chain returns ok:true and does not mutate NodeChain', async () => {
        await nodeChain.append('a', { x: 1 });
        await nodeChain.append('b', { x: 2 });
        const before = await nodeChain.list();

        const result = await service.verifyChain();
        expect(result).toEqual({ ok: true });

        const after = await nodeChain.list();
        expect(after.length).toBe(before.length);
        expect(after.map((s) => s.hash)).toEqual(before.map((s) => s.hash));
    });

    // I10: when NodeChain integrity is broken the Eye signals via the Oversight Ledger only.
    it('I10: verifyChain on a tampered chain returns ok:false and logs an anomaly', async () => {
        await nodeChain.append('a', { x: 1 });
        const middle = await nodeChain.append('b', { x: 2 });
        await nodeChain.append('c', { x: 3 });

        const snapshotRepo = moduleRef.get<Repository<ExecutionSnapshot>>(
            getRepositoryToken(ExecutionSnapshot),
        );
        await snapshotRepo.update(
            { sequenceId: middle.sequenceId },
            { payload: { x: 999 } },
        );

        const result = await service.verifyChain();
        expect(result.ok).toBe(false);
        expect(result.brokenAt).toBe(middle.sequenceId);

        const entries = await service.getLog();
        const anomalies = entries.filter((e) => e.eventType === 'anomaly_detected');
        expect(anomalies).toHaveLength(1);
        expect(anomalies[0].layer).toBe('ledger_anchoring');
    });

    // P6: the Eye's public surface must not expose any enforcement-style operations.
    it('P6: AllSeeingEyeService exposes no enforcement methods', async () => {
        const prototype = Object.getPrototypeOf(service);
        const methodNames = Object.getOwnPropertyNames(prototype);
        const forbidden = [
            'enforce',
            'halt',
            'revert',
            'mutate',
            'vote',
            'command',
            'pause',
            'resume',
            'block',
            'slash',
        ];
        for (const name of forbidden) {
            expect(methodNames).not.toContain(name);
            expect((service as unknown as Record<string, unknown>)[name]).toBeUndefined();
        }
    });

    // I-EYE-5: oversight ledger hash-links every entry; the chain is recomputable.
    it('I-EYE-5: each oversight entry hash matches sha256(eventType + layer + description + prevHash + timestamp)', async () => {
        const a = await service.log('heartbeat', 'supervisory', 'tick');
        const b = await service.log('integrity_signal', 'token_management', 'baseline');
        const c = await service.log('heartbeat', 'supervisory', 'tick');

        const entries = [a, b, c];
        let expectedPrev = 'GENESIS';
        for (const entry of entries) {
            const expectedHash = sha256(
                entry.eventType + entry.layer + entry.description + expectedPrev + entry.timestamp,
            );
            expect(entry.prevHash).toBe(expectedPrev);
            expect(entry.hash).toBe(expectedHash);
            expectedPrev = entry.hash;
        }
    });

    // I-EYE-5: verifyLog confirms a healthy ledger.
    it('I-EYE-5: verifyLog returns ok:true for a healthy oversight ledger', async () => {
        await service.log('heartbeat', 'supervisory', 'tick');
        await service.log('integrity_signal', 'token_management', 'baseline');
        const result = await service.verifyLog();
        expect(result).toEqual({ ok: true });
    });

    // I-EYE-5: tampering with a stored entry breaks the oversight ledger continuity.
    it('I-EYE-5: tampering with an entry description breaks verifyLog at that id', async () => {
        await service.log('heartbeat', 'supervisory', 'tick');
        const middle = await service.log('integrity_signal', 'token_management', 'baseline');
        await service.log('heartbeat', 'supervisory', 'tick');

        await oversightRepo.update(
            { id: middle.id },
            { description: 'tampered description' },
        );

        const result = await service.verifyLog();
        expect(result.ok).toBe(false);
        expect(result.brokenAt).toBe(middle.id);
    });

    // I-NC-3 analogue for oversight: the first entry's prevHash is the literal 'GENESIS'.
    it('I-EYE-5: the first oversight entry links to the literal GENESIS marker', async () => {
        const first = await service.log('heartbeat', 'supervisory', 'tick');
        expect(first.prevHash).toBe('GENESIS');
        expect(first.id).toBe(1);
    });

    // getLog returns entries in ascending id order.
    it('getLog returns oversight entries ordered by ascending id', async () => {
        await service.log('heartbeat', 'supervisory', 'one');
        await service.log('heartbeat', 'supervisory', 'two');
        await service.log('heartbeat', 'supervisory', 'three');
        const entries = await service.getLog();
        expect(entries.map((e) => e.description)).toEqual(['one', 'two', 'three']);
        expect(entries.map((e) => e.id)).toEqual([1, 2, 3]);
    });
});
