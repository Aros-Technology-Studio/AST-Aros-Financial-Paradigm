import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MetaLogService } from './meta_log.service';

@Injectable()
export class AnomalyDetectionService implements OnModuleInit {
    private readonly logger = new Logger(AnomalyDetectionService.name);

    constructor(
        private readonly metaLog: MetaLogService
    ) { }

    onModuleInit() {
        this.logger.log('The All-Seeing Eye is active and observing.');
        this.emitHeartbeat();
    }

    private emitHeartbeat() {
        setInterval(() => {
            this.metaLog.logEvent('heartbeat', 'system_pulse', { status: 'active' });
        }, 60000); // Every minute
    }

    // --- PATTERN: GOV-001 (Proposal without Quorum) ---
    // Listens to: governance.vote.cast
    @OnEvent('governance.vote.cast', { async: true })
    async checkGovernanceRegularity(payload: { proposalId: string, voterId: string, currentVotes: number }) {
        // This is a simplified check. In real implementation, it would fetch Proposal metadata.
        // For prototype, we just log the observation.

        // Example Anomaly: If votes > 1000 (impossible number), flag it.
        if (payload.currentVotes > 1000) {
            await this.metaLog.logEvent('anomaly_detected', 'governance_layer', {
                description: 'Vote count exceeds theoretical max',
                details: payload
            }, 'GOV-002');
        }
    }

    // --- PATTERN: TOK-201 (Mint without Authorization) ---
    // Listens to: token.mint
    @OnEvent('token.mint', { async: true })
    async checkMintAuthorization(payload: { amount: string, recipient: string, refId: string }) {
        // The Eye checks if refId follows the "PROPOSAL_..." or "DEPOSIT_..." pattern
        const refId = payload.refId;

        if (!refId.startsWith('PROPOSAL_') && !refId.startsWith('DEP_') && !refId.startsWith('BRIDGE_')) {
            await this.metaLog.logEvent('anomaly_detected', 'token_management', {
                description: 'Mint event detected without standard reference structure',
                refId: refId
            }, 'TOK-201');
        }
    }

    // --- PATTERN: EXE-101 (Transaction Replay) ---
    // Listens to: ledger.transaction.recorded
    @OnEvent('ledger.transaction.recorded', { async: true })
    async checkExecutionFlow(payload: { hash: string, ledgerHeight: string, sender: string, nonce: number }) {
        // In a real system, we'd cache recent hashes to detect duplicates.
        // For now, we assume LedgerService enforces uniqueness, so The Eye just logs the observation.
        // But if we saw two events with same nonce...

        // Simulating a logic check:
        if (payload.nonce < 0) {
            await this.metaLog.logEvent('anomaly_detected', 'processing_layer', {
                description: 'Negative nonce detected',
                hash: payload.hash
            }, 'EXE-102');
        }
    }
}
