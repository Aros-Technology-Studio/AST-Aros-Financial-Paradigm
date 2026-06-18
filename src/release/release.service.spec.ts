import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinLedger } from '../aroscoin/entities/aroscoin-ledger.entity';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { CommonModule } from '../common/common.module';
import { EmissionModule } from '../emission/emission.module';
import { EmissionService } from '../emission/emission.service';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodeChainService } from '../nodechain/nodechain.service';
import { PotVerdict } from '../pot/entities/pot-verdict.entity';
import { PotModule } from '../pot/pot.module';
import { PotService } from '../pot/pot.service';
import { StateRecordingModule } from '../state-recording/state-recording.module';
import { StateRecordingService } from '../state-recording/state-recording.service';
import { ReserveModule } from '../reserve/reserve.module';
import { ReleasePhase } from './entities/release-phase.entity';
import { ReleaseModule } from './release.module';
import { ReleaseService } from './release.service';

/**
 * Specs exercise the Release maturity gate against a real TypeORM stack on in-memory SQLite.
 * Capitalization is built by confirming and emitting real process volume (so reserveIndex is
 * derived from NodeChain), and circulating supply is established through ArosCoin so velocity
 * is well-defined.
 *
 * They assert: activation requires BOTH conditions (I-RL-1) — each single-condition-true case
 * stays inactive; determinism (I-RL-2 / I4) — identical metrics yield identical outcomes;
 * circulation stays bounded (inactive) until both conditions hold (I-RL-3 / P7); and activation
 * is recorded in NodeChain (I-RL-4).
 */
describe('ReleaseService', () => {
    let moduleRef: TestingModule;
    let release: ReleaseService;
    let emission: EmissionService;
    let pot: PotService;
    let recording: StateRecordingService;
    let chain: NodeChainService;
    let coin: ArosCoinService;

    /** Confirm a process and emit `amount` of volume, raising the derived reserveIndex. */
    async function confirmAndEmit(processId: string, amount: number): Promise<void> {
        await recording.capture(processId, 'initiation', { amount });
        await recording.capture(processId, 'task_assignment', { nodes: ['node-1'] });
        await recording.capture(processId, 'stage_transition', { stage: 'execute' });
        await recording.capture(processId, 'execution_complete', {});
        await pot.verify(processId);
        await emission.emit(processId, amount);
    }

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                CommonModule,
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [ExecutionSnapshot, PotVerdict, ArosCoinLedger, ReleasePhase],
                    synchronize: true,
                    logging: false,
                }),
                NodeChainModule,
                StateRecordingModule,
                PotModule,
                ArosCoinModule,
                EmissionModule,
                ReserveModule,
                ReleaseModule,
            ],
        }).compile();

        release = moduleRef.get(ReleaseService);
        emission = moduleRef.get(EmissionService);
        pot = moduleRef.get(PotService);
        recording = moduleRef.get(StateRecordingService);
        chain = moduleRef.get(NodeChainService);
        coin = moduleRef.get(ArosCoinService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // velocity = processVolume_24h / circulatingSupply, guarded on zero supply.
    it('velocity guards divide-by-zero -> 0 on empty supply', async () => {
        expect(await coin.totalSupply()).toBe(0);
        expect(await release.velocity(1000)).toBe(0);
    });

    it('velocity = processVolume_24h / circulatingSupply', async () => {
        await coin.recordEarned(100); // circulating (retained) supply = 100
        expect(await coin.totalSupply()).toBe(100);
        expect(await release.velocity(50)).toBeCloseTo(0.5, 10);
    });

    // I-RL-3 / P7: with no confirmed volume the economy is immature and stays bounded.
    it('I-RL-3/P7: inactive until conditions hold; activate() is a no-op when immature', async () => {
        const result = await release.activate(3, 0.1, 1000);
        expect(result.activated).toBe(false);
        expect(result.active).toBe(false);
        expect(await release.isActive()).toBe(false);
    });

    // I-RL-1: capitalization met but activity not met -> stays inactive.
    it('I-RL-1: reserveIndex > threshold but velocity <= target -> inactive', async () => {
        // Volume 2000 -> reserveIndex = log10(2001) ~= 3.30 > threshold 3.
        await confirmAndEmit('cap-1', 2000);
        await coin.recordEarned(1000); // circulating supply = 1000

        // velocity = 50 / 1000 = 0.05, below target 0.1.
        const check = await release.check(3, 0.1, 50);
        expect(check.reserveIndex).toBeGreaterThan(3);
        expect(check.velocity).toBeLessThanOrEqual(0.1);
        expect(check.mature).toBe(false);

        const result = await release.activate(3, 0.1, 50);
        expect(result.activated).toBe(false);
        expect(await release.isActive()).toBe(false);
    });

    // I-RL-1: activity met but capitalization not met -> stays inactive.
    it('I-RL-1: velocity > target but reserveIndex <= threshold -> inactive', async () => {
        // Volume 100 -> reserveIndex = log10(101) ~= 2.0 < threshold 3.
        await confirmAndEmit('act-1', 100);
        await coin.recordEarned(100); // circulating supply = 100 (+100 retained earned)

        // velocity = 1000 / 200 = 5 > target 0.1, but reserveIndex below threshold.
        const check = await release.check(3, 0.1, 1000);
        expect(check.velocity).toBeGreaterThan(0.1);
        expect(check.reserveIndex).toBeLessThanOrEqual(3);
        expect(check.mature).toBe(false);

        const result = await release.activate(3, 0.1, 1000);
        expect(result.activated).toBe(false);
        expect(await release.isActive()).toBe(false);
    });

    // I-RL-1: BOTH conditions met -> activates.
    it('I-RL-1: both conditions met -> activates', async () => {
        await confirmAndEmit('both-1', 2000); // reserveIndex ~ 3.30 > 3
        await coin.recordEarned(1000);         // circulating supply = 1000

        // velocity = 1000 / 1000 = 1.0 > target 0.1.
        const check = await release.check(3, 0.1, 1000);
        expect(check.mature).toBe(true);

        const result = await release.activate(3, 0.1, 1000);
        expect(result.activated).toBe(true);
        expect(result.active).toBe(true);
        expect(await release.isActive()).toBe(true);
    });

    // I-RL-4: activation is recorded in NodeChain (observable).
    it('I-RL-4: activation appends a release.activated snapshot to NodeChain', async () => {
        await confirmAndEmit('rec-1', 2000);
        await coin.recordEarned(1000);

        await release.activate(3, 0.1, 1000);

        const head = await chain.latest();
        expect(head?.eventType).toBe('release.activated');
        expect(head?.payload).toMatchObject({ threshold: 3, target: 0.1 });
        expect(Number(head?.payload['reserveIndex'])).toBeGreaterThan(3);
    });

    // P7: an immature activate() records nothing — circulation stays bounded.
    it('P7: immature activate() records no snapshot', async () => {
        await confirmAndEmit('none-1', 100); // reserveIndex below threshold
        const before = (await chain.list()).length;

        await release.activate(3, 0.1, 1000);

        const after = (await chain.list()).length;
        expect(after).toBe(before);
        expect(await release.isActive()).toBe(false);
    });

    // I-RL-2 / I4: identical metrics yield identical check outcomes (deterministic).
    it('I-RL-2/I4: deterministic — same metrics produce the same outcome', async () => {
        await confirmAndEmit('det-1', 2000);
        await coin.recordEarned(1000);

        const a = await release.check(3, 0.1, 1000);
        const b = await release.check(3, 0.1, 1000);
        expect(a).toEqual(b);
    });

    // Activation is one-time: re-activating an active phase is a no-op (no second snapshot).
    it('activation is one-time — re-activate is a no-op', async () => {
        await confirmAndEmit('once-1', 2000);
        await coin.recordEarned(1000);

        const first = await release.activate(3, 0.1, 1000);
        expect(first.activated).toBe(true);
        const lenAfterFirst = (await chain.list()).length;

        const second = await release.activate(3, 0.1, 1000);
        expect(second.activated).toBe(false);
        expect(second.active).toBe(true);
        expect((await chain.list()).length).toBe(lenAfterFirst);
    });
});
