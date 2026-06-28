import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { ArosCoinModule } from './aroscoin.module';
import { ArosCoinService } from './aroscoin.service';
import { ArosCoinLedger } from './entities/aroscoin-ledger.entity';

/**
 * Specs exercise the unit ledger against a real TypeORM stack on in-memory SQLite. They
 * assert the derived supply identity (I6), that the process part nets to zero after a
 * mint+burn cycle (I5), and that a fresh ledger holds nothing (P5 — value exists only via
 * recorded confirmed work, never on construction or deposit).
 */
describe('ArosCoinService', () => {
    let moduleRef: TestingModule;
    let coin: ArosCoinService;

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                CommonModule,
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: [ArosCoinLedger],
                    synchronize: true,
                    logging: false,
                }),
                ArosCoinModule,
            ],
        }).compile();

        coin = moduleRef.get(ArosCoinService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // P5: a fresh ledger holds nothing — value never exists without recorded confirmed work.
    it('P5: a fresh ledger has totalSupply 0, retained 0, processNet 0', async () => {
        expect(await coin.totalSupply()).toBe(0);
        expect(await coin.retained()).toBe(0);
        expect(await coin.processNet()).toBe(0);
    });

    // I5: after a process-part mint+burn cycle the process part nets to zero.
    it('I5: processNet returns to 0 after a matching mint and burn', async () => {
        await coin.recordMint(100);
        expect(await coin.processNet()).toBe(100);

        await coin.recordBurn(100);
        expect(await coin.processNet()).toBe(0);
    });

    // I6: totalSupply is derived = (processMinted - processBurned) + earnedRetained.
    it('I6: totalSupply equals earnedRetained once the process part is burned', async () => {
        await coin.recordMint(100);
        await coin.recordEarned(7);
        // process part still live: totalSupply = (100 - 0) + 7
        expect(await coin.totalSupply()).toBe(107);

        await coin.recordBurn(100);
        // process part burned: totalSupply collapses to retained earned value
        expect(await coin.totalSupply()).toBe(7);
        expect(await coin.totalSupply()).toBe(await coin.retained());
    });

    // The snapshot/supplyView shapes feed AllSeeingEye.compareSupply.
    it('exposes snapshot and supplyView consistent with the tallies', async () => {
        await coin.recordMint(50);
        await coin.recordBurn(50);
        await coin.recordEarned(12);

        const snap = await coin.snapshot();
        expect(snap).toMatchObject({ processMinted: 50, processBurned: 50, earnedRetained: 12 });
        expect(typeof snap.timestamp).toBe('number');

        const view = await coin.supplyView();
        expect(view).toEqual({ totalSupply: 12, retained: 12 });
    });

    // internalPrice = base * reserveIndex.
    it('derives internalPrice from the reserve index', async () => {
        expect(coin.internalPrice(2)).toBe(2);
        expect(coin.internalPrice(0.5)).toBe(0.5);
    });
});
