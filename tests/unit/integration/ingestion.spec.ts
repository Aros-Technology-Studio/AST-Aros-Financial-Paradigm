import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService } from '../../../src/integration/ingestion/ingestion.service';

describe('IngestionService', () => {
    let service: IngestionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [IngestionService],
        }).compile();

        service = module.get<IngestionService>(IngestionService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should ingest WBTC correctly', async () => {
        const result = await service.ingestAsset('WBTC', 0.1, 'mock_address');
        expect(result).toBe(true);
    });

    it('should reject unsupported asset', async () => {
        const result = await service.ingestAsset('DOGE', 1000, 'mock_address');
        expect(result).toBe(false);
    });
});
