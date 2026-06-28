import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { AppController } from '../../src/app.controller';
import { CommonModule } from '../../src/common/common.module';
import { OversightLogEntry } from '../../src/all-seeing-eye/entities/oversight-log-entry.entity';
import { ArosCoinLedger } from '../../src/aroscoin/entities/aroscoin-ledger.entity';
import { Epoch } from '../../src/commission/entities/epoch.entity';
import { NodeEntity } from '../../src/nodes/entities/node.entity';
import { ExecutionSnapshot } from '../../src/nodechain/entities/execution-snapshot.entity';
import { OrchestratorModule } from '../../src/orchestrator/orchestrator.module';
import { PotVerdict } from '../../src/pot/entities/pot-verdict.entity';
import { ReleasePhase } from '../../src/release/entities/release-phase.entity';

/**
 * App e2e — boots the HTTP surface (health + orchestrator + metrics) over an in-memory SQLite
 * datasource so the suite never depends on a live Postgres. It mirrors the production wiring
 * (AppController for health, OrchestratorModule for the lifecycle and metrics) and the global
 * ValidationPipe, but swaps the datasource the production AppModule would use.
 */
const ENTITIES = [
    ExecutionSnapshot,
    PotVerdict,
    ArosCoinLedger,
    Epoch,
    NodeEntity,
    ReleasePhase,
    OversightLogEntry,
];

describe('App HTTP surface (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                CommonModule,
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: ENTITIES,
                    synchronize: true,
                    logging: false,
                }),
                OrchestratorModule,
            ],
            controllers: [AppController],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('GET / returns the health payload', async () => {
        const res = await request(app.getHttpServer()).get('/').expect(200);
        expect(res.body).toMatchObject({ ok: true, service: 'AST' });
    });

    it('POST /processes runs the lifecycle and verifies an admissible process', async () => {
        const res = await request(app.getHttpServer())
            .post('/processes')
            .send({ processId: 'E-1', amount: 500, type: 'transfer', admissible: true, epoch: 1 })
            .expect(201);
        expect(res.body.verified).toBe(1);
        expect(res.body.minted).toBe(500);
    });

    it('POST /processes rejects a malformed body via ValidationPipe', async () => {
        await request(app.getHttpServer())
            .post('/processes')
            .send({ processId: 'E-bad', amount: -1, type: 'transfer', admissible: true })
            .expect(400);
    });

    it('GET /processes/:id returns the verdict and recorded events', async () => {
        const res = await request(app.getHttpServer()).get('/processes/E-1').expect(200);
        expect(res.body.processId).toBe('E-1');
        expect(res.body.verdict.verified).toBe(1);
        expect(res.body.events.length).toBeGreaterThan(0);
    });

    it('GET /metrics returns a read-only snapshot', async () => {
        const res = await request(app.getHttpServer()).get('/metrics?epoch=1').expect(200);
        expect(res.body).toEqual(
            expect.objectContaining({
                totalSupply: expect.any(Number),
                earnedRetained: expect.any(Number),
                reserveIndex: expect.any(Number),
                verifiedProcessCount: expect.any(Number),
                currentEpoch: 1,
                epochPool: expect.any(Number),
                nodeChainLength: expect.any(Number),
                releaseActive: expect.any(Boolean),
            }),
        );
    });
});
