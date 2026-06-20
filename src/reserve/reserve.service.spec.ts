import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinLedger } from '../aroscoin/entities/aroscoin-ledger.entity';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { CommonModule } from '../common/common.module';
import { log10 } from '../common/hash.util';
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
import { ReserveModule } from './reserve.module';
import { ReserveService } from './reserve.service';

/**
 * Specs exercise the Reserve index against a real TypeORM stack on in-memory SQLite. Confirmed
 * volume is produced the way the system produces it: a process is fully recorded, PoT-verified,
 * and emitted, which appends an `emission.minted` snapshot to NodeChain. The Reserve then
 * derives `reserveIndex = log10(1 + totalProcessVolume)` from that history.
 *
 * They assert: index grows only from confirmed (PoT-verified, emitted) volume (I-RS-1),
 * the index is monotonic non-decreasing in volume (I-RS-4), the index is derived/recomputed
 * from history rather than set manually (I-RS-2), and `reserveIndex == 0` on an empty economy
 * (log10(1) = 0).
 */
describe('ReserveService', () => {
    let moduleRef: TestingModule;
    let reserve: ReserveService;
    let emission: EmissionService;
    let pot: PotService;
    let recording: StateRecordingService;
    let chain: NodeChainService;

    /** Record the full required sequence, verify, and emit `amount` of confirmed volume. */
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
                    entities: [ExecutionSnapshot, PotVerdict, ArosCoinLedger],
                    synchronize: true,
                    logging: false,
                }),
                NodeChainModule,
                StateRecordingModule,
                PotModule,
                ArosCoinModule,
                EmissionModule,
                ReserveModule,
            ],
        }).compile();

        reserve = moduleRef.get(ReserveService);
        emission = moduleRef.get(EmissionService);
        pot = moduleRef.get(PotService);
        recording = moduleRef.get(StateRecordingService);
        chain = moduleRef.get(NodeChainService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // log10(1) = 0: with no confirmed volume the index is exactly zero.
    it('reserveIndex == 0 when volume == 0', async () => {
        expect(await reserve.totalProcessVolume()).toBe(0);
        expect(await reserve.reserveIndex()).toBe(0);
    });

    // I-RS-1: the index reflects confirmed (verified + emitted) volume.
    it('I-RS-1: index grows from confirmed volume', async () => {
        await confirmAndEmit('p-1', 100);

        expect(await reserve.totalProcessVolume()).toBe(100);
        expect(await reserve.reserveIndex()).toBeCloseTo(log10(1 + 100), 10);
    });

    // I-RS-1: an unverified process is never emitted, so it contributes no volume.
    it('I-RS-1: an unverified process contributes no volume', async () => {
        // Record only part of the sequence: PoT will not verify, Emission mints nothing.
        await recording.capture('p-bad', 'initiation', { amount: 500 });
        await pot.verify('p-bad');
        await emission.emit('p-bad', 500);

        expect(await reserve.totalProcessVolume()).toBe(0);
        expect(await reserve.reserveIndex()).toBe(0);
    });

    // I-RS-4: more confirmed volume -> non-decreasing index.
    it('I-RS-4: reserveIndex is monotonic non-decreasing in volume', async () => {
        const i0 = await reserve.reserveIndex();

        await confirmAndEmit('m-1', 50);
        const i1 = await reserve.reserveIndex();

        await confirmAndEmit('m-2', 200);
        const i2 = await reserve.reserveIndex();

        expect(i1).toBeGreaterThanOrEqual(i0);
        expect(i2).toBeGreaterThanOrEqual(i1);
        expect(await reserve.totalProcessVolume()).toBe(250);
    });

    // I-RS-2: the index is recomputed from NodeChain history, not stored as an authority.
    // Appending more confirmed volume changes the derived index without any setter.
    it('I-RS-2: reserveIndex is derived from history, never set manually', async () => {
        await confirmAndEmit('d-1', 100);
        const before = await reserve.reserveIndex();

        await confirmAndEmit('d-2', 900);
        const after = await reserve.reserveIndex();

        // Recompute independently from the chain to confirm pure derivation.
        // Formula: log10(1 + totalProcessVolume + totalAfcReserve); AFC = 0 here.
        const history = await chain.list();
        const summedVolume = history
            .filter((s) => s.eventType === 'emission.minted')
            .reduce((acc, s) => acc + Number(s.payload['minted'] ?? 0), 0);
        const summedAfc = history
            .filter((s) => s.eventType === 'reserve.afc.accrual')
            .reduce((acc, s) => acc + Number(s.payload['amount'] ?? 0), 0);

        expect(summedVolume).toBe(1000);
        expect(after).toBeCloseTo(log10(1 + summedVolume + summedAfc), 10);
        expect(after).toBeGreaterThan(before);
        // No mutator exists on the service to set the index.
        expect((reserve as unknown as Record<string, unknown>)['setReserveIndex']).toBeUndefined();
    });

    // Canonical model: AFC Reserve grows → emission price rises. Each epoch finalization routes
    // 25% of fees to the AFC Reserve, which feeds the index and raises the next emission price.
    it('AFC accrual raises the emission price index', async () => {
        const before = await reserve.reserveIndex();
        await reserve.addAfcAccrual(1000);
        const after = await reserve.reserveIndex();

        expect(after).toBeGreaterThan(before);
        expect(await reserve.getCurrentEmissionPrice()).toBeCloseTo(after, 10);
        expect(await reserve.totalAfcReserve()).toBe(1000);
    });

    // internalPrice = base * reserveIndex.
    it('internalPrice = base * reserveIndex', async () => {
        await confirmAndEmit('ip-1', 100);
        const index = await reserve.reserveIndex();
        expect(await reserve.internalPrice(2)).toBeCloseTo(2 * index, 10);
    });
});
