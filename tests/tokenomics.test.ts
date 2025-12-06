
import { Test, TestingModule } from '@nestjs/testing';
import { TokenomicsService } from '../src/token/tokenomics.service';

describe('TokenomicsService', () => {
    let service: TokenomicsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [TokenomicsService],
        }).compile();

        service = module.get<TokenomicsService>(TokenomicsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('calculateTokenPrice', () => {
        it('should calculate price based on utilization and volatility', () => {
            const price = service.calculateTokenPrice({
                utilizationIndex: 2.0,
                fiatVolatility: 0.05
            });
            // P = 1.0 * ln(2) + 0.5 * 0.05 + 0.1
            // P = 0.693 + 0.025 + 0.1 = 0.818
            expect(price).toBeCloseTo(0.818, 2);
        });

        it('should respect minimum floor price', () => {
            const price = service.calculateTokenPrice({
                utilizationIndex: 0.000001, // Very low util
                fiatVolatility: 0
            });
            expect(price).toBeGreaterThanOrEqual(0.01);
        });
    });

    describe('calculateEmissionVolume', () => {
        it('should calculate emission based on volume and utilization', () => {
            const emission = service.calculateEmissionVolume({
                transactionVolume: 1000,
                networkUtilization: 0.8
            });
            // TE = 0.05 * 1000 + 0.02 * 0.8 + 100
            // TE = 50 + 0.016 + 100 = 150.016
            expect(emission).toBeCloseTo(150.016, 2);
        });
    });
});
