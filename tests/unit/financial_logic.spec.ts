import { Test, TestingModule } from '@nestjs/testing';
import { NodeMetricsService } from '../../src/nodechain/node_metrics.service';
import { TokenEconomicsService } from '../../src/token/token_economics.service';
import { ProofService } from '../../src/processing/proof.service';

describe('Financial Logic Services', () => {
    let nodeMetrics: NodeMetricsService;
    let tokenEconomics: TokenEconomicsService;
    let proofService: ProofService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [NodeMetricsService, TokenEconomicsService, ProofService],
        }).compile();

        nodeMetrics = module.get<NodeMetricsService>(NodeMetricsService);
        tokenEconomics = module.get<TokenEconomicsService>(TokenEconomicsService);
        proofService = module.get<ProofService>(ProofService);
    });

    describe('NodeMetricsService (TVS & NRI)', () => {
        it('should calculate TVS correctly', () => {
            const txs = [
                { latency: 0.1, validSignature: true },
                { latency: 0.2, validSignature: true },
                { latency: 0.5, validSignature: false }, // Signature fail
            ];
            // Formula: Sum(1 + 1/(lat+0.1)*S) * U
            // Tx1: 1 + 1/0.2 * 1 = 6
            // Tx2: 1 + 1/0.3 * 1 = 4.333
            // Tx3: 1 + 1/0.6 * 0 = 1
            // Sum = 11.333
            // Uptime = 1.0 -> 11.333

            const tvs = nodeMetrics.calculateTVS(txs, 1.0);
            expect(tvs).toBeCloseTo(11.333, 2);
        });

        it('should calculate NRI with decay', () => {
            const history = [100, 80, 50]; // Newest first
            // NRI = (1/3) * (100*1 + 80*0.9 + 50*0.81)
            // 100 + 72 + 40.5 = 212.5
            // Avg = 70.833

            const nri = nodeMetrics.calculateNRI(history, 0.9);
            expect(nri).toBeCloseTo(70.833, 2);
        });
    });

    describe('TokenEconomicsService (Pricing & Emission)', () => {
        it('should calculate token price', () => {
            // P = alpha * log(U) + beta * FX + gamma
            // 1.0 * log(2.718) + 1.0 * 0.1 + 0 = 1.0 + 0.1 = 1.1
            const price = tokenEconomics.calculateTokenPrice(Math.E, 0.1);
            expect(price).toBeCloseTo(1.1, 1);
        });

        it('should calculate emission volume', () => {
            // TE = 0.01 * 1000 + 0.05 * 0.5 + 0 = 10 + 0.025 = 10.025
            const emission = tokenEconomics.calculateEmissionVolume(1000, 0.5);
            expect(emission).toBeCloseTo(10.025, 3);
        });
    });

    describe('ProofService (PoC & DPH)', () => {
        it('should generate consistent PoC hashes', () => {
            const hash1 = proofService.generatePoC('tx1', 'kyc1', 123, ['sig1']);
            const hash2 = proofService.generatePoC('tx1', 'kyc1', 123, ['sig1']);
            expect(hash1).toBe(hash2);
            expect(hash1).toHaveLength(64); // SHA256 hex
        });

        it('should verify PoC correctly in off-chain logic', () => {
            const hash = proofService.generatePoC('tx1', 'kyc1', 123, ['sig1']);
            const isValid = proofService.verifyPoC(hash, 'tx1', 'kyc1', 123, ['sig1']);
            expect(isValid).toBe(true);
        });
    });
});
