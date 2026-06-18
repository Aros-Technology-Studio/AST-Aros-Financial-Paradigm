import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClockService } from '../common/clock.service';
import { sha256 } from '../common/hash.util';
import { ExecutionSnapshot } from './entities/execution-snapshot.entity';
import { NodeChainService } from './nodechain.service';

/**
 * Specs exercise the NodeChain invariants directly against a real TypeORM stack backed
 * by an in-memory SQLite database. The in-memory driver keeps the suite fully
 * self-contained: no live Postgres is required, and every test starts with a clean
 * chain because `dropSchema: true` is set on module configuration.
 */
describe('NodeChainService', () => {
    let moduleRef: TestingModule;
    let service: NodeChainService;
    let repo: Repository<ExecutionSnapshot>;

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [ExecutionSnapshot],
                    synchronize: true,
                    logging: false,
                }),
                TypeOrmModule.forFeature([ExecutionSnapshot]),
            ],
            providers: [ClockService, NodeChainService],
        }).compile();

        service = moduleRef.get(NodeChainService);
        repo = moduleRef.get<Repository<ExecutionSnapshot>>(
            getRepositoryToken(ExecutionSnapshot),
        );
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I-NC-3: genesis prevHash empty, sequence starts at 1.
    it('I-NC-3: genesis snapshot has empty prevHash and sequenceId 1', async () => {
        const snap = await service.append('genesis.event', { kind: 'init' });
        expect(snap.sequenceId).toBe(1);
        expect(snap.prevHash).toBe('');
    });

    // I-NC-1 (positive form): append produces strictly increasing sequenceIds.
    it('I-NC-1: append produces strictly increasing sequenceIds starting at 1', async () => {
        const a = await service.append('e.a', { i: 1 });
        const b = await service.append('e.b', { i: 2 });
        const c = await service.append('e.c', { i: 3 });
        expect([a.sequenceId, b.sequenceId, c.sequenceId]).toEqual([1, 2, 3]);
    });

    // I-NC-2: hash(n) = sha256(JSON.stringify(payload) + prevHash + sequenceId).
    it('I-NC-2: each hash matches sha256(payloadJson + prevHash + sequenceId)', async () => {
        const payloads: Record<string, unknown>[] = [
            { kind: 'start', who: 'orchestrator' },
            { kind: 'verify', verdict: true },
            { kind: 'finalize', amount: 42 },
        ];
        const snaps: ExecutionSnapshot[] = [];
        for (let i = 0; i < payloads.length; i++) {
            snaps.push(await service.append(`event.${i}`, payloads[i]));
        }
        let expectedPrev = '';
        for (let i = 0; i < snaps.length; i++) {
            const s = snaps[i];
            const expectedHash = sha256(
                JSON.stringify(payloads[i]) + expectedPrev + s.sequenceId,
            );
            expect(s.prevHash).toBe(expectedPrev);
            expect(s.hash).toBe(expectedHash);
            expectedPrev = s.hash;
        }
    });

    // I-NC-2: reconstruct() verifies the entire chain.
    it('I-NC-2: reconstruct() returns ok:true for a healthy chain', async () => {
        await service.append('a', { x: 1 });
        await service.append('b', { x: 2 });
        await service.append('c', { x: 3 });
        const result = await service.reconstruct();
        expect(result).toEqual({ ok: true });
    });

    // I-NC-2: tampering with stored payload breaks reconstruction at that sequenceId.
    it('I-NC-2: tampering with a snapshot payload makes reconstruct() report the break', async () => {
        await service.append('a', { x: 1 });
        const middle = await service.append('b', { x: 2 });
        await service.append('c', { x: 3 });

        // Direct repository update bypasses the service surface to simulate corruption
        // of the persisted store; the chain hash will no longer match.
        await repo.update(
            { sequenceId: middle.sequenceId },
            { payload: { x: 999 } },
        );

        const result = await service.reconstruct();
        expect(result.ok).toBe(false);
        expect(result.brokenAt).toBe(middle.sequenceId);
    });

    // I-NC-1: the service surface offers no mutating operations beyond append.
    it('I-NC-1: service exposes no update / delete / remove / truncate API', async () => {
        const prototype = Object.getPrototypeOf(service);
        const methodNames = Object.getOwnPropertyNames(prototype);
        const forbidden = ['update', 'delete', 'remove', 'truncate', 'rewrite', 'reorder'];
        for (const name of forbidden) {
            expect(methodNames).not.toContain(name);
            expect((service as unknown as Record<string, unknown>)[name]).toBeUndefined();
        }
    });

    it('latest() returns null on empty chain and the head afterwards', async () => {
        expect(await service.latest()).toBeNull();
        const a = await service.append('a', { i: 1 });
        const latest = await service.latest();
        expect(latest?.sequenceId).toBe(a.sequenceId);
        expect(latest?.hash).toBe(a.hash);
    });

    it('getBySequence() returns the matching snapshot or null', async () => {
        const a = await service.append('a', { i: 1 });
        const fetched = await service.getBySequence(a.sequenceId);
        expect(fetched?.hash).toBe(a.hash);
        expect(await service.getBySequence(999)).toBeNull();
    });

    it('list() returns snapshots ordered by ascending sequenceId', async () => {
        await service.append('a', { i: 1 });
        await service.append('b', { i: 2 });
        await service.append('c', { i: 3 });
        const all = await service.list();
        expect(all.map((s) => s.sequenceId)).toEqual([1, 2, 3]);
    });
});
