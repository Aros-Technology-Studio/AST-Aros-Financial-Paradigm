import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService } from '../../../src/integration/ingestion/ingestion.service';
import { TokenService } from '../../../src/token/token.service';

const mockTokenService = {
    mintForTransaction: jest.fn().mockResolvedValue({ emissionAmount: 5000 }),
};

describe('IngestionService', () => {
    let service: IngestionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                IngestionService,
                { provide: TokenService, useValue: mockTokenService },
            ],
        }).compile();

        service = module.get<IngestionService>(IngestionService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should ingest WBTC correctly via canonical mintForTransaction', async () => {
        const result = await service.ingestAsset('WBTC', 0.1, 'mock_address');
        expect(result).toBe(true);
        // 0.1 WBTC × 50_000 rate = 5_000 ARO minted via canonical emission
        expect(mockTokenService.mintForTransaction).toHaveBeenCalledWith(
            5000,
            'mock_address',
            expect.stringContaining('INGEST_WBTC_'),
        );
    });

    it('should reject unsupported asset without calling mintForTransaction', async () => {
        const result = await service.ingestAsset('DOGE', 1000, 'mock_address');
        expect(result).toBe(false);
        expect(mockTokenService.mintForTransaction).not.toHaveBeenCalled();
    });
});
