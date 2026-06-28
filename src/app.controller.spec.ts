import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

/**
 * AppController exposes the liveness probe. The spec confirms the health payload reports the
 * service identity and a timestamp, so uptime checks have a stable contract.
 */
describe('AppController', () => {
    let controller: AppController;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [AppController],
        }).compile();
        controller = moduleRef.get(AppController);
    });

    it('reports a healthy AST service', () => {
        const health = controller.getHealth();
        expect(health.ok).toBe(true);
        expect(health.service).toBe('AST');
    });

    it('returns an ISO-8601 timestamp', () => {
        const { ts } = controller.getHealth();
        expect(Number.isNaN(Date.parse(ts))).toBe(false);
    });
});
