import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyDetectionService } from '../../../src/supervisory/anomaly_detection.service';
import { MetaLogService } from '../../../src/supervisory/meta_log.service';

describe('AnomalyDetectionService', () => {
    let service: AnomalyDetectionService;
    let metaLogService: Partial<MetaLogService>;

    beforeEach(async () => {
        metaLogService = {
            logEvent: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnomalyDetectionService,
                { provide: MetaLogService, useValue: metaLogService },
            ],
        }).compile();

        service = module.get<AnomalyDetectionService>(AnomalyDetectionService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('checkGovernanceRegularity', () => {
        it('should detect GOV-002 if votes exceed threshold', async () => {
            await service.checkGovernanceRegularity({
                proposalId: 'prop_1',
                voterId: 'node_1',
                currentVotes: 1001 // > 1000 threshold
            });

            expect(metaLogService.logEvent).toHaveBeenCalledWith(
                'anomaly_detected',
                'governance_layer',
                expect.anything(),
                'GOV-002'
            );
        });

        it('should NOT log anomaly if votes are within limit', async () => {
            await service.checkGovernanceRegularity({
                proposalId: 'prop_1',
                voterId: 'node_1',
                currentVotes: 50
            });

            expect(metaLogService.logEvent).not.toHaveBeenCalled();
        });
    });

    describe('checkMintAuthorization', () => {
        it('should detect TOK-201 if refId is malformed', async () => {
            await service.checkMintAuthorization({
                amount: '100',
                recipient: 'addr1',
                refId: 'RANDOM_STRING'
            });

            expect(metaLogService.logEvent).toHaveBeenCalledWith(
                'anomaly_detected',
                'token_management',
                expect.anything(),
                'TOK-201'
            );
        });

        it('should NOT log anomaly if refId is PROPOSAL_', async () => {
            await service.checkMintAuthorization({
                amount: '100',
                recipient: 'addr1',
                refId: 'PROPOSAL_123'
            });

            expect(metaLogService.logEvent).not.toHaveBeenCalled();
        });
    });
});
