import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinLedger } from '../aroscoin/entities/aroscoin-ledger.entity';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { CommonModule } from '../common/common.module';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodeChainService } from '../nodechain/nodechain.service';
import { PotVerdict } from '../pot/entities/pot-verdict.entity';
import { PotModule } from '../pot/pot.module';
import { PotService } from '../pot/pot.service';
import { StateRecordingModule } from '../state-recording/state-recording.module';
import { StateRecordingService } from '../state-recording/state-recording.service';
import { EmissionModule } from './emission.module';
import { EmissionService } from './emission.service';

/**
 * Specs exercise PoT-gated emission against a real TypeORM stack on in-memory SQLite.
 * They assert that emission mints only on a verified process and nets the process part to
 * zero (I1/I5/I6), that an unverified process mints nothing (I1/I2/P7), that mint and burn
 * events are recorded in NodeChain, and that emission is deterministic (I4).
 */
describe('EmissionService', () => {
    let moduleRef: TestingModule;
    let emission: EmissionService;
    let coin: ArosCoinService;
    let pot: PotService;
    let recording: StateRecordingService;
    let chain: NodeChainService;

    /** Record the full event sequence PoT requires, then issue the verdict. */
    async function verifyProcess(processId: string): Promise<void> {
        await recording.capture(processId, 'initiation', { amount: 100 });
        await recording.capture(processId, 'task_assignment', { nodes: ['node-1'] });
        await recording.capture(processId, 'stage_transition', { stage: 'execute' });
        await recording.capture(processId, 'execution_complete', {});
        await pot.verify(processId);
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
            ],
        }).compile();

        emission = moduleRef.get(EmissionService);
        coin = moduleRef.get(ArosCoinService);
        pot = moduleRef.get(PotService);
        recording = moduleRef.get(StateRecordingService);
        chain = moduleRef.get(NodeChainService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I1/I5/I6: emit on a verified process mints the process part and burns it; the process
    // part nets to zero and totalSupply equals earnedRetained (here 0, no earned part yet).
    it('I1/I5/I6: emit on a verified process nets the process part to 0', async () => {
        await verifyProcess('p-1');

        const result = await emission.emit('p-1', 100);

        expect(result.authorized).toBe(true);
        expect(result.minted).toBe(100);
        expect(result.burned).toBe(100);
        expect(await coin.processNet()).toBe(0);
        expect(await coin.totalSupply()).toBe(0);
        expect(await coin.totalSupply()).toBe(await coin.retained());
    });

    // I1/I2/P7: an unverified process mints and burns nothing; totalSupply stays 0.
    it('I1/I2/P7: emit on an unverified process mints nothing', async () => {
        // No events recorded, no verdict issued.
        const result = await emission.emit('ghost', 100);

        expect(result.authorized).toBe(false);
        expect(result.minted).toBe(0);
        expect(result.burned).toBe(0);
        expect(await coin.totalSupply()).toBe(0);
        expect(await coin.processNet()).toBe(0);
    });

    // P7: a process whose verdict is 0 (incomplete evidence) is also refused.
    it('P7: emit on a verified:0 process mints nothing', async () => {
        await recording.capture('p-incomplete', 'initiation', { amount: 100 });
        const verdict = await pot.verify('p-incomplete');
        expect(verdict.verified).toBe(0);

        const result = await emission.emit('p-incomplete', 100);
        expect(result.authorized).toBe(false);
        expect(await coin.totalSupply()).toBe(0);
    });

    // I2: the low-level mint throws when called for an unverified process (no silent mint).
    it('I2: mint() throws for an unverified process', async () => {
        await expect(emission.mint('ghost', 100)).rejects.toThrow(/no PoT confirmation/);
        expect(await coin.totalSupply()).toBe(0);
    });

    // emission.minted and emission.burned events are recorded in NodeChain.
    it('records emission.minted and emission.burned in NodeChain', async () => {
        await verifyProcess('p-2');
        await emission.emit('p-2', 100);

        const events = await chain.list();
        const types = events.map((e) => e.eventType);
        expect(types).toContain('emission.minted');
        expect(types).toContain('emission.burned');

        const minted = events.find((e) => e.eventType === 'emission.minted');
        const burned = events.find((e) => e.eventType === 'emission.burned');
        expect(minted?.payload).toMatchObject({ processId: 'p-2', minted: 100 });
        expect(burned?.payload).toMatchObject({ processId: 'p-2', burned: 100 });
    });

    // calculate() is a pure, side-effect-free breakdown of the canonical emission formula.
    it('calculate() returns canonical 1:1 emission breakdown', () => {
        const result = emission.calculate(10_000);
        expect(result.emission).toBe(10_000);          // 1:1
        expect(result.commission).toBeCloseTo(50, 9);  // 0.5%
        expect(result.nodeShare).toBeCloseTo(37.5, 9); // 75% of commission
        expect(result.afcReserve).toBeCloseTo(12.5, 9); // 25% of commission

        // nodeShare + afcReserve == commission (reconciles)
        expect(result.nodeShare + result.afcReserve).toBeCloseTo(result.commission, 9);
    });

    it('calculate() accepts a custom rate', () => {
        const result = emission.calculate(1000, 0.01);
        expect(result.commission).toBeCloseTo(10, 9);
        expect(result.nodeShare).toBeCloseTo(7.5, 9);
        expect(result.afcReserve).toBeCloseTo(2.5, 9);
    });

    // I4: the same verified process and amount yield the same supply outcome.
    it('I4: identical verified emissions yield identical supply outcomes', async () => {
        await verifyProcess('det-a');
        await verifyProcess('det-b');

        const a = await emission.emit('det-a', 100);
        const supplyAfterA = await coin.totalSupply();

        const b = await emission.emit('det-b', 100);
        const supplyAfterB = await coin.totalSupply();

        expect(a.minted).toBe(b.minted);
        expect(a.burned).toBe(b.burned);
        // both cycles net to zero, so total supply is unchanged across both
        expect(supplyAfterA).toBe(0);
        expect(supplyAfterB).toBe(0);
    });
});
