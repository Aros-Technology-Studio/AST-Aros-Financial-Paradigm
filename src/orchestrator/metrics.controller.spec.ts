import { Test } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { OrchestratorService } from './orchestrator.service';

/**
 * MetricsController exposes the read-only metrics snapshot and epoch finalization. These specs
 * confirm it delegates to OrchestratorService and forwards the parsed epoch argument, using a
 * mocked service so the controller is exercised in isolation.
 */
describe('MetricsController', () => {
    let controller: MetricsController;
    const service = {
        metrics: jest.fn(),
        finalizeEpoch: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        const moduleRef = await Test.createTestingModule({
            controllers: [MetricsController],
            providers: [{ provide: OrchestratorService, useValue: service }],
        }).compile();
        controller = moduleRef.get(MetricsController);
    });

    it('delegates GET /metrics to metrics with the selected epoch', async () => {
        const snapshot = { totalSupply: 0, currentEpoch: 2 };
        service.metrics.mockResolvedValue(snapshot);

        await expect(controller.metrics(2)).resolves.toBe(snapshot);
        expect(service.metrics).toHaveBeenCalledWith(2);
    });

    it('delegates POST /epochs/:epoch/finalize to finalizeEpoch with the path epoch', async () => {
        const distribution = { epochNumber: 3, reconciled: true };
        service.finalizeEpoch.mockResolvedValue(distribution);

        await expect(controller.finalize(3)).resolves.toBe(distribution);
        expect(service.finalizeEpoch).toHaveBeenCalledWith(3);
    });
});
