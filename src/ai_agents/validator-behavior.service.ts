
import { Injectable, Logger } from '@nestjs/common';

export interface ValidatorMetrics {
    heartbeat: number;      // 0.0 - 1.0 (Consistency)
    attestation: number;    // 0.0 - 1.0 (Timeliness)
    stake: number;          // 0.0 - 1.0 (Consistency)
    gossip: number;         // 0.0 - 1.0 (Participation)
    miss_rate: number;      // 0.0 - 1.0 (Batch Miss Rate inverse? Or pure rate?)
    // Docs say "Percentage of missed slots", so lower is better.
    // But scores imply higher is better (0.90 is Trusted).
    // So we will assume input is "Success Rate" or we invert "Miss Rate" for scoring.
    // Let's assume input 'miss_rate' score is already normalized to "Reliability" (1 - miss_rate).
    divergence: number;     // 0.0 - 1.0 (Voting consensus alignment)
    uptime: number;         // 0.0 - 1.0 (Availability)
}

export interface ValidatorScore {
    vid: string;
    epoch: number;
    scores: ValidatorMetrics;
    composite_score: number;
    threshold_status: 'Trusted' | 'Watchlist' | 'Degraded' | 'Unreliable';
}

@Injectable()
export class ValidatorBehaviorService {
    private readonly logger = new Logger(ValidatorBehaviorService.name);

    // Weights for composite score calculation
    private readonly WEIGHTS = {
        heartbeat: 0.15,
        attestation: 0.15,
        stake: 0.10,
        gossip: 0.10,
        miss_rate: 0.20, // High impact
        divergence: 0.15,
        uptime: 0.15,
    };

    // Simplified history storage for trend analysis
    private readonly history = new Map<string, number[]>();

    /**
     * Evaluates a validator's performance for a given epoch.
     * @param vid Validator ID
     * @param epoch Current Epoch Number
     * @param metrics Raw normalized metrics (0.0 to 1.0, where 1.0 is best)
     */
    evaluateValidator(vid: string, epoch: number, metrics: ValidatorMetrics): ValidatorScore {
        const compositeScore = this.calculateCompositeScore(metrics);
        const status = this.determineStatus(compositeScore);

        // Trend Analysis
        this.assessRiskTrend(vid, compositeScore);

        const scoreData: ValidatorScore = {
            vid,
            epoch,
            scores: metrics,
            composite_score: parseFloat(compositeScore.toFixed(2)),
            threshold_status: status,
        };

        if (status === 'Unreliable' || status === 'Degraded') {
            this.handleEscalation(scoreData);
        }

        return scoreData;
    }

    private assessRiskTrend(vid: string, currentScore: number) {
        if (!this.history.has(vid)) {
            this.history.set(vid, []);
        }
        const scores = this.history.get(vid);
        scores.push(currentScore);
        if (scores.length > 5) scores.shift(); // Keep last 5 epochs

        // Check for rapid drop (e.g., > 15% drop in last 3 epochs)
        if (scores.length >= 2) {
            const previous = scores[scores.length - 2];
            if (previous - currentScore > 0.15) {
                this.logger.warn(`Behavior Alert: Validator ${vid} score dropped rapidly (${previous.toFixed(2)} -> ${currentScore.toFixed(2)})`);
            }
        }
    }

    private calculateCompositeScore(metrics: ValidatorMetrics): number {
        let score = 0;
        score += metrics.heartbeat * this.WEIGHTS.heartbeat;
        score += metrics.attestation * this.WEIGHTS.attestation;
        score += metrics.stake * this.WEIGHTS.stake;
        score += metrics.gossip * this.WEIGHTS.gossip;
        score += metrics.miss_rate * this.WEIGHTS.miss_rate; // Assuming input is "Success/Reliability" score
        score += metrics.divergence * this.WEIGHTS.divergence;
        score += metrics.uptime * this.WEIGHTS.uptime;
        return score;
    }

    private determineStatus(score: number): ValidatorScore['threshold_status'] {
        if (score >= 0.90) return 'Trusted';
        if (score >= 0.80) return 'Watchlist';
        if (score >= 0.65) return 'Degraded';
        return 'Unreliable';
    }

    private handleEscalation(data: ValidatorScore) {
        this.logger.warn(`Validator ${data.vid} flagged as ${data.threshold_status} (Score: ${data.composite_score})`);

        // In a real implementation, this would:
        // 1. Emit 'behavior_alert' event
        // 2. Reduce emission weight (logic hook)
        // 3. Notify REWARD-CORE
    }
}
