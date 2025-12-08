import { Test, TestingModule } from '@nestjs/testing';
import { NodeMetricsService } from '../../src/nodechain/node_metrics.service';
import { TokenomicsService } from '../../src/token/tokenomics.service';
import { ProofService } from '../../src/processing/proof.service';

describe('Financial Logic Services', () => {
    let nodeMetrics: NodeMetricsService;
    let tokenEconomics: TokenomicsService;
    let proofService: ProofService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [NodeMetricsService, TokenomicsService, ProofService],
        }).compile();

        nodeMetrics = module.get<NodeMetricsService>(NodeMetricsService);
        tokenEconomics = module.get<TokenomicsService>(TokenomicsService);
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
            // Config: alpha=1.0, beta=0.5, gamma=0.1
            // 1.0 * log(2.718) + 0.5 * 0.1 + 0.1 = 1.0 + 0.05 + 0.1 = 1.15
            const price = tokenEconomics.calculateTokenPrice({
                utilizationIndex: Math.E,
                fiatVolatility: 0.1
            });
            expect(price).toBeCloseTo(1.15, 2);
        });

        it('should calculate emission volume', () => {
            // TE = alpha * TV + beta * U + gamma
            // Config: alpha=0.05, beta=0.02, gamma=100
            // 0.05 * 1000 + 0.02 * 0.5 + 100 = 50 + 0.01 + 100 = 150.01
            const emission = tokenEconomics.calculateEmissionVolume({
                transactionVolume: 1000,
                networkUtilization: 0.5
            });
            expect(emission).toBeCloseTo(150.01, 2);
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
