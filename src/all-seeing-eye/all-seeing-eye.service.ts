import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClockService } from '../common/clock.service';
import { sha256 } from '../common/hash.util';
import { NodeChainService } from '../nodechain/nodechain.service';
import { OversightLogEntry } from './entities/oversight-log-entry.entity';

/**
 * AllSeeingEyeService — the passive supra-process meta-observer of AST.
 *
 * The Eye implements the canonical cycle observe -> log -> compare -> signal. Its
 * sole output is writing to its own append-only Merkle-linked Oversight Ledger:
 * every method is read-only with respect to the rest of the system. The Eye
 * witnesses NodeChain integrity, compares supply snapshots against expected
 * invariants, and records non-binding integrity signals.
 *
 * Spec: docs/specs/AST_AllSeeingEye_AGENT_EN.md
 * Reference: reference/ast-core/src/allSeeingEye.ts
 *
 * Hashing mirrors the reference:
 *     hash(n) = sha256(eventType + layer + description + prevHash + timestamp)
 *
 * The public surface is intentionally limited to log + read + compare + verify.
 * The Eye is a witness: it records what it sees and emits signals, leaving
 * authority over execution to other modules. (Invariant I10; prohibition P6.)
 */
@Injectable()
export class AllSeeingEyeService {
    constructor(
        @InjectRepository(OversightLogEntry)
        private readonly repo: Repository<OversightLogEntry>,
        private readonly clock: ClockService,
        private readonly nodeChain: NodeChainService,
    ) { }

    /**
     * Append one observation to the immutable Oversight Ledger. The write runs
     * inside a transaction so that the read of the current head and the insert of
     * the new entry are atomic relative to other writers, preserving hash
     * continuity. This is the only mutating operation on the Eye's own ledger;
     * it never touches state outside the Oversight Ledger.
     */
    async log(eventType: string, layer: string, description: string): Promise<OversightLogEntry> {
        const dataSource: DataSource = this.repo.manager.connection;
        return dataSource.transaction(async (manager) => {
            const txRepo = manager.getRepository(OversightLogEntry);
            const head = await txRepo
                .createQueryBuilder('entry')
                .orderBy('entry.id', 'DESC')
                .limit(1)
                .getOne();

            const prevHash = head ? head.hash : 'GENESIS';
            const timestamp = this.clock.now();
            const hash = sha256(eventType + layer + description + prevHash + timestamp);

            const entry = txRepo.create({
                eventType,
                layer,
                description,
                hash,
                prevHash,
                timestamp,
                signature: '',
            });
            return txRepo.save(entry);
        });
    }

    /**
     * Compare an observed supply snapshot against the invariant
     * `totalSupply === retained`. When the observation diverges the Eye records
     * an 'anomaly_detected' entry in the Oversight Ledger and returns the verdict.
     *
     * The method is a witness: it reports what it sees and writes to its own
     * ledger. Authority over how the system responds to the signal remains with
     * the receiving modules; callers decide what to do with the verdict.
     */
    async compareSupply(observed: { totalSupply: number; retained: number }): Promise<{ consistent: boolean }> {
        const consistent = observed.totalSupply === observed.retained;
        if (!consistent) {
            await this.log(
                'anomaly_detected',
                'token_management',
                `supply drift: totalSupply=${observed.totalSupply} retained=${observed.retained}`,
            );
        }
        return { consistent };
    }

    /**
     * Read the NodeChain via its public read API and confirm hash continuity.
     * When `NodeChainService.reconstruct()` reports a break the Eye records an
     * 'anomaly_detected' entry in the Oversight Ledger and returns the verdict.
     * The Eye reads the NodeChain; it never mutates it.
     */
    async verifyChain(): Promise<{ ok: boolean; brokenAt?: number }> {
        const result = await this.nodeChain.reconstruct();
        if (!result.ok) {
            await this.log(
                'anomaly_detected',
                'ledger_anchoring',
                `nodechain integrity break at sequenceId=${result.brokenAt}`,
            );
        }
        return result;
    }

    /**
     * Replay the Oversight Ledger from genesis and verify that every stored hash
     * matches `sha256(eventType + layer + description + prevHash + timestamp)`
     * and that prevHash linkage is intact. Returns `{ ok: true }` for a healthy
     * ledger, or `{ ok: false, brokenAt: id }` identifying the first divergent
     * entry. This is a read-only self-audit.
     */
    async verifyLog(): Promise<{ ok: boolean; brokenAt?: number }> {
        const entries = await this.getLog();
        let expectedPrevHash = 'GENESIS';
        for (const entry of entries) {
            const expectedHash = sha256(
                entry.eventType + entry.layer + entry.description + expectedPrevHash + entry.timestamp,
            );
            if (entry.prevHash !== expectedPrevHash || entry.hash !== expectedHash) {
                return { ok: false, brokenAt: entry.id };
            }
            expectedPrevHash = entry.hash;
        }
        return { ok: true };
    }

    /** Returns the entire Oversight Ledger ordered by ascending id. Read-only. */
    async getLog(): Promise<OversightLogEntry[]> {
        return this.repo
            .createQueryBuilder('entry')
            .orderBy('entry.id', 'ASC')
            .getMany();
    }
}
