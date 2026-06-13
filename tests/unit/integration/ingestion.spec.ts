import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService } from '../../../src/integration/ingestion/ingestion.service';
import { TokenService } from '../../../src/token/token.service';

const mockTokenService = {
    mintForTransaction: jest.fn().mockResolvedValue({ emissionAmount: 5000, commission: 25 }),
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

    it('should ingest WBTC and call canonical mintForTransaction', async () => {
        const result = await service.ingestAsset('WBTC', 0.1, 'mock_address');
        expect(result).toBe(true);
        // 0.1 WBTC × 50,000 rate = 5,000 AROS emitted canonically
        expect(mockTokenService.mintForTransaction).toHaveBeenCalledWith(
            5000,
            'mock_address',
            expect.stringContaining('INGEST_WBTC'),
        );
    });

    it('should reject unsupported asset', async () => {
        const result = await service.ingestAsset('DOGE', 1000, 'mock_address');
        expect(result).toBe(false);
        expect(mockTokenService.mintForTransaction).not.toHaveBeenCalled();
    });
});
