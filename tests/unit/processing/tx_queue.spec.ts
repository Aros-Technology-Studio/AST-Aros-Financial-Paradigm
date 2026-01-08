import { Test, TestingModule } from '@nestjs/testing';
import { TxQueueService } from '../../../src/processing/tx_queue.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('TxQueueService', () => {
    let service: TxQueueService;
    let mockQueue: any;

    beforeEach(async () => {
        mockQueue = {
            add: jest.fn().mockResolvedValue({ id: 'job_123' }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TxQueueService,
                {
                    provide: getQueueToken('nodechain_tx_queue'),
                    useValue: mockQueue,
                },
            ],
        }).compile();

        service = module.get<TxQueueService>(TxQueueService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should add transaction to queue', async () => {
        const tx = { hash: '0x123', sender: 'Alice' };
        const result = await service.enqueueTransaction(tx);

        expect(mockQueue.add).toHaveBeenCalledWith('process_tx', tx, expect.any(Object));
        expect(result).toEqual({
            jobId: 'job_123',
            status: 'QUEUED',
            timestamp: expect.any(String),
        });
    });
});
