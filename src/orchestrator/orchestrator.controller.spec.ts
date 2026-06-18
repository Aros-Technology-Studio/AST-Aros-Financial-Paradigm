import { Test } from '@nestjs/testing';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';
import { RunProcessDto } from './dto/run-process.dto';

/**
 * OrchestratorController is a thin HTTP surface with no logic of its own. These specs confirm
 * it delegates each route to OrchestratorService and returns the service result unchanged,
 * using a mocked service so the controller is exercised in isolation.
 */
describe('OrchestratorController', () => {
    let controller: OrchestratorController;
    const service = {
        runProcess: jest.fn(),
        getProcess: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        const moduleRef = await Test.createTestingModule({
            controllers: [OrchestratorController],
            providers: [{ provide: OrchestratorService, useValue: service }],
        }).compile();
        controller = moduleRef.get(OrchestratorController);
    });

    it('delegates POST /processes to runProcess and returns its result', async () => {
        const dto: RunProcessDto = { processId: 'p-1', amount: 100, type: 'transfer', admissible: true };
        const result = { processId: 'p-1', verified: 1 };
        service.runProcess.mockResolvedValue(result);

        await expect(controller.run(dto)).resolves.toBe(result);
        expect(service.runProcess).toHaveBeenCalledWith(dto);
    });

    it('delegates GET /processes/:id to getProcess with the path id', async () => {
        const record = { processId: 'p-1', verdict: null, events: [] };
        service.getProcess.mockResolvedValue(record);

        await expect(controller.get('p-1')).resolves.toBe(record);
        expect(service.getProcess).toHaveBeenCalledWith('p-1');
    });
});
