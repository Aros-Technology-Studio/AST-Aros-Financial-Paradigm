import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClockService } from '../common/clock.service';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import { NodeChainService } from '../nodechain/nodechain.service';
import { NodeEntity } from './entities/node.entity';
import { NodesService } from './nodes.service';

/**
 * Specs verify the Nodes module against the Model 1 canon: influence flows from work
 * and reputation (I9), the entity has no stake / stakedBalance field (P1, P2), and
 * NodeChain receives both registration and payment receipts (I3).
 *
 * The test stack uses an in-memory SQLite database with `dropSchema: true` so every
 * test starts from an empty registry and a fresh chain.
 */
describe('NodesService', () => {
    let moduleRef: TestingModule;
    let service: NodesService;
    let chain: NodeChainService;
    let nodeRepo: Repository<NodeEntity>;
    let snapshotRepo: Repository<ExecutionSnapshot>;

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [NodeEntity, ExecutionSnapshot],
                    synchronize: true,
                    logging: false,
                }),
                TypeOrmModule.forFeature([NodeEntity, ExecutionSnapshot]),
            ],
            providers: [ClockService, NodeChainService, NodesService],
        }).compile();

        service = moduleRef.get(NodesService);
        chain = moduleRef.get(NodeChainService);
        nodeRepo = moduleRef.get<Repository<NodeEntity>>(getRepositoryToken(NodeEntity));
        snapshotRepo = moduleRef.get<Repository<ExecutionSnapshot>>(
            getRepositoryToken(ExecutionSnapshot),
        );
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I9 + P1: the entity shape itself excludes any stake / stakedBalance column.
    it('I9/P1: NodeEntity exposes no stake or stakedBalance field', async () => {
        const node = await service.register('node-influence', 'validator');
        expect('stake' in node).toBe(false);
        expect('stakedBalance' in node).toBe(false);
        const keys = Object.keys(node);
        expect(keys).not.toContain('stake');
        expect(keys).not.toContain('stakedBalance');
        expect(keys).not.toContain('stakeFreeze');

        const meta = nodeRepo.metadata.columns.map((c) => c.propertyName);
        expect(meta).not.toContain('stake');
        expect(meta).not.toContain('stakedBalance');
        expect(meta).not.toContain('stakeFreeze');
    });

    // I9: weight derives from work and reputation, not from any balance field.
    it('I9: weight is derived from reputation and uptime, never from a balance', () => {
        const meta = nodeRepo.metadata.columns.map((c) => c.propertyName);
        expect(meta).toEqual(
            expect.arrayContaining([
                'id',
                'type',
                'uptime',
                'successes',
                'total',
                'status',
                'weight',
                'reputation',
            ]),
        );
        // No balance-shaped columns should exist on the entity.
        expect(meta).not.toContain('balance');
        expect(meta).not.toContain('lockedBalance');
    });

    // P2: the service surface offers no slashing-against-balance operation.
    it('P2: NodesService exposes no slashing / stake mutation API', () => {
        const prototype = Object.getPrototypeOf(service);
        const methodNames = Object.getOwnPropertyNames(prototype);
        const forbidden = ['slash', 'slashStake', 'freezeStake', 'unfreezeStake', 'stake'];
        for (const name of forbidden) {
            expect(methodNames).not.toContain(name);
            expect((service as unknown as Record<string, unknown>)[name]).toBeUndefined();
        }
    });

    // Registration persists the node and writes a snapshot to NodeChain (I3).
    it('register() persists the node and appends a node.registered snapshot', async () => {
        const node = await service.register('node-1', 'validator');

        expect(node.id).toBe('node-1');
        expect(node.type).toBe('validator');
        expect(node.status).toBe('active');
        expect(node.successes).toBe(0);
        expect(node.total).toBe(0);
        expect(node.uptime).toBe(1);
        expect(node.weight).toBe(1);
        expect(node.reputation).toBe(1);

        const persisted = await nodeRepo.findOne({ where: { id: 'node-1' } });
        expect(persisted?.type).toBe('validator');

        const head = await chain.latest();
        expect(head?.eventType).toBe('node.registered');
        expect(head?.payload).toMatchObject({ nodeId: 'node-1', type: 'validator' });
    });

    it('list() returns every registered node', async () => {
        await service.register('node-a', 'validator');
        await service.register('node-b', 'router');
        const all = await service.list();
        expect(all.map((n) => n.id).sort()).toEqual(['node-a', 'node-b']);
    });

    // Deterministic reputation: successes/total * uptime; 1 when total === 0.
    it('recordExecution() refreshes successes/total and recomputes reputation deterministically', async () => {
        await service.register('node-2', 'validator');

        const fresh = await service.get('node-2');
        expect(fresh?.reputation).toBe(1);

        const afterFail = await service.recordExecution('node-2', false);
        expect(afterFail.total).toBe(1);
        expect(afterFail.successes).toBe(0);
        expect(afterFail.reputation).toBe(0); // 0/1 * 1

        const afterPass = await service.recordExecution('node-2', true);
        expect(afterPass.total).toBe(2);
        expect(afterPass.successes).toBe(1);
        expect(afterPass.reputation).toBeCloseTo(0.5, 10); // 1/2 * 1

        const afterAnotherPass = await service.recordExecution('node-2', true);
        expect(afterAnotherPass.total).toBe(3);
        expect(afterAnotherPass.successes).toBe(2);
        expect(afterAnotherPass.reputation).toBeCloseTo(2 / 3, 10);
    });

    // currentWeight() tracks the formula `reputation * uptime`.
    it('currentWeight() reflects reputation and uptime changes', async () => {
        await service.register('node-3', 'router');
        // A brand-new node has reputation 1 and uptime 1, so weight is 1.
        expect(await service.currentWeight('node-3')).toBe(1);

        await service.recordExecution('node-3', true);
        await service.recordExecution('node-3', false);
        // reputation = 1/2 * 1 = 0.5 => weight = 0.5 * 1
        expect(await service.currentWeight('node-3')).toBeCloseTo(0.5, 10);

        // Reduce observed uptime and re-record: weight follows the new uptime.
        const stored = await nodeRepo.findOneOrFail({ where: { id: 'node-3' } });
        stored.uptime = 0.5;
        await nodeRepo.save(stored);
        await service.recordExecution('node-3', true);
        // successes=2, total=3, uptime=0.5 => reputation = (2/3) * 0.5 = 1/3
        // weight = reputation * uptime = 1/3 * 0.5 = 1/6
        expect(await service.currentWeight('node-3')).toBeCloseTo(1 / 6, 10);
    });

    // receivePayment() records the post-factum event without touching the entity state.
    it('receivePayment() appends a snapshot and does not mutate node fields', async () => {
        await service.register('node-4', 'recorder');
        await service.recordExecution('node-4', true);
        const before = await nodeRepo.findOneOrFail({ where: { id: 'node-4' } });
        const beforeJson = JSON.stringify(before);

        await service.receivePayment('node-4', 42);

        const after = await nodeRepo.findOneOrFail({ where: { id: 'node-4' } });
        expect(JSON.stringify(after)).toBe(beforeJson);

        const head = await chain.latest();
        expect(head?.eventType).toBe('node.payment.received');
        expect(head?.payload).toMatchObject({
            nodeId: 'node-4',
            amount: 42,
            weight: before.weight,
        });
    });

    // I3: both registration and payment events end up on the append-only chain.
    it('I3: registration and payment both appear on the NodeChain history', async () => {
        await service.register('node-5', 'validator');
        await service.receivePayment('node-5', 7);

        const history = await chain.list();
        const types = history.map((s) => s.eventType);
        expect(types).toEqual(['node.registered', 'node.payment.received']);
        expect(history.map((s) => s.sequenceId)).toEqual([1, 2]);
        expect(history[1].prevHash).toBe(history[0].hash);

        // Sanity: the snapshot store also reflects two rows.
        const persisted = await snapshotRepo.find();
        expect(persisted.length).toBe(2);
    });
});
