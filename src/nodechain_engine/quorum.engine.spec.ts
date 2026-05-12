import { QuorumEngine, WeightedVote } from './quorum.engine';

// Helper: build N uniform-weight approving votes
function makeApprovalVotes(count: number, nodeWeight = 1.0): WeightedVote[] {
    return Array.from({ length: count }, (_, i) => ({
        voterId: `NODE_${i}`,
        approved: true,
        nodeWeight,
    }));
}

// Helper: build a mixed set (approved + rejected)
function makeVotes(approved: number, rejected: number, nodeWeight = 1.0): WeightedVote[] {
    const votes: WeightedVote[] = [];
    for (let i = 0; i < approved; i++) {
        votes.push({ voterId: `APPROVE_${i}`, approved: true, nodeWeight });
    }
    for (let i = 0; i < rejected; i++) {
        votes.push({ voterId: `REJECT_${i}`, approved: false, nodeWeight });
    }
    return votes;
}

describe('QuorumEngine', () => {
    let engine: QuorumEngine;

    beforeEach(() => {
        engine = new QuorumEngine();
    });

    // ─── computeCountThreshold ──────────────────────────────────────────────

    describe('computeCountThreshold', () => {
        it('should return 1 for n=0 (degenerate)', () => {
            expect(engine.computeCountThreshold(0)).toBe(1);
        });

        it('should handle n=1 → q = ceil(0.667) + 1 = 2', () => {
            // ceil(2/3 * 1) + 1 = ceil(0.667) + 1 = 1 + 1 = 2
            expect(engine.computeCountThreshold(1)).toBe(2);
        });

        it('should handle n=3 → q = ceil(2) + 1 = 3', () => {
            // ceil(2/3 * 3) + 1 = ceil(2) + 1 = 3
            expect(engine.computeCountThreshold(3)).toBe(3);
        });

        it('should handle n=4 → q = ceil(2.667) + 1 = 4', () => {
            // ceil(2/3 * 4) + 1 = ceil(2.667) + 1 = 3 + 1 = 4
            expect(engine.computeCountThreshold(4)).toBe(4);
        });

        it('should handle n=7 → q = ceil(4.667) + 1 = 6', () => {
            // ceil(2/3 * 7) + 1 = ceil(4.667) + 1 = 5 + 1 = 6
            expect(engine.computeCountThreshold(7)).toBe(6);
        });

        it('should handle n=10 → q = ceil(6.667) + 1 = 8', () => {
            // ceil(2/3 * 10) + 1 = ceil(6.667) + 1 = 7 + 1 = 8
            expect(engine.computeCountThreshold(10)).toBe(8);
        });
    });

    // ─── computeWeightThreshold ─────────────────────────────────────────────

    describe('computeWeightThreshold', () => {
        it('should return 1 for totalWeight=0 (degenerate)', () => {
            expect(engine.computeWeightThreshold(0)).toBe(1);
        });

        it('should calculate weighted threshold for totalWeight=3', () => {
            // ceil(2/3 * 3) + 1 = ceil(2) + 1 = 3
            expect(engine.computeWeightThreshold(3)).toBe(3);
        });

        it('should calculate weighted threshold for totalWeight=6.5', () => {
            // ceil(2/3 * 6.5) + 1 = ceil(4.333) + 1 = 5 + 1 = 6
            expect(engine.computeWeightThreshold(6.5)).toBe(6);
        });
    });

    // ─── computeMaxFaults ───────────────────────────────────────────────────

    describe('computeMaxFaults', () => {
        it('should return 0 for n=1', () => {
            expect(engine.computeMaxFaults(1)).toBe(0);
        });

        it('should return 0 for n=3 (need 4 for f=1)', () => {
            // floor((3-1)/3) = floor(0.667) = 0
            expect(engine.computeMaxFaults(3)).toBe(0);
        });

        it('should return 1 for n=4', () => {
            // floor((4-1)/3) = floor(1) = 1
            expect(engine.computeMaxFaults(4)).toBe(1);
        });

        it('should return 2 for n=7', () => {
            // floor((7-1)/3) = floor(2) = 2
            expect(engine.computeMaxFaults(7)).toBe(2);
        });

        it('should return 3 for n=10', () => {
            // floor((10-1)/3) = floor(3) = 3
            expect(engine.computeMaxFaults(10)).toBe(3);
        });
    });

    // ─── isBftCompliant ─────────────────────────────────────────────────────

    describe('isBftCompliant', () => {
        it('n=4 with f=1 should be compliant', () => {
            expect(engine.isBftCompliant(4, 1)).toBe(true);
        });

        it('n=3 with f=1 should NOT be compliant (3 < 3*1+1)', () => {
            expect(engine.isBftCompliant(3, 1)).toBe(false);
        });

        it('n=7 with f=2 should be compliant', () => {
            expect(engine.isBftCompliant(7, 2)).toBe(true);
        });

        it('n=6 with f=2 should NOT be compliant (6 < 7)', () => {
            expect(engine.isBftCompliant(6, 2)).toBe(false);
        });
    });

    // ─── evaluate — кворум достигнут ────────────────────────────────────────

    describe('evaluate — quorum reached', () => {
        it('should reach quorum with 4 out of 4 approvals (n=4, uniform weights)', () => {
            const votes = makeApprovalVotes(4);
            const result = engine.evaluate(votes, 4, 4);
            expect(result.reached).toBe(true);
            expect(result.countThreshold).toBe(4);
            expect(result.approvedCount).toBe(4);
        });

        it('should reach quorum with 6 out of 7 approvals (n=7)', () => {
            const votes = makeVotes(6, 1);
            const result = engine.evaluate(votes, 7, 7);
            expect(result.reached).toBe(true);
            expect(result.approvedCount).toBe(6);
            expect(result.countThreshold).toBe(6);
        });

        it('should reach quorum with exactly the threshold count', () => {
            // n=10: threshold = 8; give exactly 8 approvals
            const votes = makeApprovalVotes(8);
            const result = engine.evaluate(votes, 10, 10);
            expect(result.reached).toBe(true);
            expect(result.approvedCount).toBe(8);
        });
    });

    // ─── evaluate — кворум НЕ достигнут ─────────────────────────────────────

    describe('evaluate — quorum NOT reached', () => {
        it('should fail quorum when 0 votes submitted', () => {
            const result = engine.evaluate([], 7, 7);
            expect(result.reached).toBe(false);
            expect(result.approvedCount).toBe(0);
        });

        it('should fail quorum with only 5 out of 7 approvals (need 6)', () => {
            const votes = makeVotes(5, 2);
            const result = engine.evaluate(votes, 7, 7);
            expect(result.reached).toBe(false);
            expect(result.approvedCount).toBe(5);
            expect(result.countThreshold).toBe(6);
        });

        it('should fail quorum when majority reject', () => {
            const votes = makeVotes(3, 4);
            const result = engine.evaluate(votes, 7, 7);
            expect(result.reached).toBe(false);
            expect(result.rejectedCount).toBe(4);
        });
    });

    // ─── evaluate — взвешенное голосование ──────────────────────────────────

    describe('evaluate — NodeWeight consideration', () => {
        it('should pass weighted quorum when heavy nodes approve', () => {
            // n=4, but 2 nodes have weight 2.0 and 2 have weight 1.0 → totalWeight=6
            // weightThreshold = ceil(2/3 * 6) + 1 = ceil(4) + 1 = 5
            // countThreshold = ceil(2/3 * 4) + 1 = ceil(2.667) + 1 = 4
            // 3 approvals with weights [2.0, 2.0, 1.0] → approvedWeight=5 ≥ 5 ✓
            // but approvedCount=3 < countThreshold=4 ✗ → quorum NOT reached
            const votes: WeightedVote[] = [
                { voterId: 'HEAVY_1', approved: true, nodeWeight: 2.0 },
                { voterId: 'HEAVY_2', approved: true, nodeWeight: 2.0 },
                { voterId: 'LIGHT_1', approved: true, nodeWeight: 1.0 },
                { voterId: 'LIGHT_2', approved: false, nodeWeight: 1.0 },
            ];
            const result = engine.evaluate(votes, 4, 6);
            // count: 3 < 4 → NOT reached (even though weight ok)
            expect(result.approvedWeight).toBe(5);
            expect(result.approvedCount).toBe(3);
            expect(result.reached).toBe(false);
        });

        it('should pass both count and weight quorum with 4 approvals out of 4', () => {
            // n=4, totalWeight = 2+2+1+1 = 6
            // countThreshold = 4, weightThreshold = ceil(2/3 * 6)+1 = 5
            // all 4 approve → approvedCount=4 ≥ 4, approvedWeight=6 ≥ 5
            const votes: WeightedVote[] = [
                { voterId: 'HEAVY_1', approved: true, nodeWeight: 2.0 },
                { voterId: 'HEAVY_2', approved: true, nodeWeight: 2.0 },
                { voterId: 'LIGHT_1', approved: true, nodeWeight: 1.0 },
                { voterId: 'LIGHT_2', approved: true, nodeWeight: 1.0 },
            ];
            const result = engine.evaluate(votes, 4, 6);
            expect(result.reached).toBe(true);
            expect(result.approvedWeight).toBe(6);
            expect(result.approvedCount).toBe(4);
            expect(result.weightThreshold).toBe(5);
        });

        it('should fail weighted quorum when weight sum is below threshold despite enough count', () => {
            // n=4, all low-weight nodes (0.1 each) → totalWeight=0.4
            // weightThreshold = ceil(2/3 * 0.4) + 1 = ceil(0.267) + 1 = 2
            // 4 approvals with weight 0.1 each → approvedWeight=0.4 < 2 → NOT reached
            const votes = Array.from({ length: 4 }, (_, i) => ({
                voterId: `NODE_${i}`,
                approved: true,
                nodeWeight: 0.1,
            }));
            const result = engine.evaluate(votes, 4, 0.4);
            expect(result.reached).toBe(false);
            expect(result.approvedCount).toBe(4); // count ok
            expect(result.approvedWeight).toBeCloseTo(0.4);
            expect(result.weightThreshold).toBe(2); // ceil(2/3*0.4)+1 = ceil(0.267)+1 = 2
        });

        it('should correctly attribute maxByzantineFaults', () => {
            // n=10 → f = floor(9/3) = 3
            const votes = makeApprovalVotes(8);
            const result = engine.evaluate(votes, 10, 10);
            expect(result.maxByzantineFaults).toBe(3);
        });

        it('should use nodeWeight from vote: high-weight nodes pass, low-weight nodes fail', () => {
            // 4 high-weight nodes (5.0 each) → totalWeight=20
            // weightThreshold = ceil(2/3 * 20) + 1 = ceil(13.333) + 1 = 15
            // approvedWeight = 20 >= 15 ✓, approvedCount = 4 >= 4 ✓ → reached
            const highWeight: WeightedVote[] = [
                { voterId: 'A', approved: true, nodeWeight: 5.0 },
                { voterId: 'B', approved: true, nodeWeight: 5.0 },
                { voterId: 'C', approved: true, nodeWeight: 5.0 },
                { voterId: 'D', approved: true, nodeWeight: 5.0 },
            ];
            // 4 low-weight nodes (0.5 each) → totalWeight=2
            // weightThreshold = ceil(2/3 * 2) + 1 = ceil(1.333) + 1 = 3
            // approvedWeight = 2 < 3 ✗ → NOT reached (even though count is ok)
            const lowWeight: WeightedVote[] = [
                { voterId: 'A', approved: true, nodeWeight: 0.5 },
                { voterId: 'B', approved: true, nodeWeight: 0.5 },
                { voterId: 'C', approved: true, nodeWeight: 0.5 },
                { voterId: 'D', approved: true, nodeWeight: 0.5 },
            ];
            const rHigh = engine.evaluate(highWeight, 4, 20);
            const rLow = engine.evaluate(lowWeight, 4, 2);

            expect(rHigh.approvedWeight).toBe(20);
            expect(rLow.approvedWeight).toBe(2);
            // High weight nodes meet both thresholds
            expect(rHigh.reached).toBe(true);
            // Low weight nodes meet count threshold but NOT weight threshold → demonstrates nodeWeight impact
            expect(rLow.approvedCount).toBe(4);          // count ok
            expect(rLow.weightThreshold).toBe(3);        // weight threshold = 3
            expect(rLow.approvedWeight).toBeCloseTo(2);  // approved weight = 2.0 < 3
            expect(rLow.reached).toBe(false);            // quorum not reached due to insufficient weight
        });
    });

    // ─── evaluate — граничные случаи ────────────────────────────────────────

    describe('evaluate — edge cases', () => {
        it('should return full metadata in the result', () => {
            const votes = makeVotes(6, 1);
            const result = engine.evaluate(votes, 7, 7);
            expect(result).toMatchObject({
                totalNodes: 7,
                totalWeight: 7,
                rejectedCount: 1,
                maxByzantineFaults: 2,
            });
        });

        it('all nodes reject — quorum not reached', () => {
            const votes = makeVotes(0, 7);
            const result = engine.evaluate(votes, 7, 7);
            expect(result.reached).toBe(false);
            expect(result.approvedCount).toBe(0);
            expect(result.approvedWeight).toBe(0);
        });
    });
});
