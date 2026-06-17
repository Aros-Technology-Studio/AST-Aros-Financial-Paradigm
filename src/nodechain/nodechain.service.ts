import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClockService } from '../common/clock.service';
import { sha256 } from '../common/hash.util';
import { ExecutionSnapshot } from './entities/execution-snapshot.entity';

/**
 * NodeChainService — the append-only system of record of AST.
 *
 * Implements the operations defined in docs/specs/AST_NodeChain_AGENT_EN.md:
 *   - `append`           (spec: recordState)  — adds one hash-linked ExecutionSnapshot.
 *   - `latest`                                 — returns the head of the chain.
 *   - `getBySequence`                          — fetches a specific snapshot by position.
 *   - `list`                                   — returns history ordered by sequenceId.
 *   - `reconstruct`      (spec: reconstruct)   — replays every hash from genesis.
 *
 * Hashing follows the reference (`reference/ast-core/src/nodechain.ts`):
 *     hash(n) = sha256(JSON.stringify(payload) || prevHash || sequenceId)
 *
 * Every timestamp is taken from `ClockService.now()`, so identical inputs reproduce
 * identical chains — satisfying invariants I4 (determinism) and I-NC-2 (continuity).
 *
 * The public surface intentionally exposes only read and append operations: there is
 * no `update`, `delete`, `remove`, or `truncate` API. This enforces I-NC-1 (append-only).
 */
@Injectable()
export class NodeChainService {
    constructor(
        @InjectRepository(ExecutionSnapshot)
        private readonly repo: Repository<ExecutionSnapshot>,
        private readonly clock: ClockService,
    ) { }

    /**
     * Append one event to the chain. The append runs inside a transaction so that the
     * read of the current head and the insert of the new snapshot are atomic relative
     * to other appenders, preserving sequence monotonicity and hash continuity.
     */
    async append(eventType: string, payload: Record<string, unknown>): Promise<ExecutionSnapshot> {
        const dataSource: DataSource = this.repo.manager.connection;
        return dataSource.transaction(async (manager) => {
            const txRepo = manager.getRepository(ExecutionSnapshot);
            const head = await txRepo
                .createQueryBuilder('snap')
                .orderBy('snap.sequenceId', 'DESC')
                .limit(1)
                .getOne();

            const sequenceId = head ? head.sequenceId + 1 : 1;
            const prevHash = head ? head.hash : '';
            const payloadJson = JSON.stringify(payload);
            const hash = sha256(payloadJson + prevHash + sequenceId);
            const timestamp = this.clock.now();

            const snapshot = txRepo.create({
                sequenceId,
                eventType,
                payload,
                timestamp,
                prevHash,
                hash,
            });
            return txRepo.save(snapshot);
        });
    }

    /** Returns the most recently appended snapshot, or null on an empty chain. */
    async latest(): Promise<ExecutionSnapshot | null> {
        return this.repo
            .createQueryBuilder('snap')
            .orderBy('snap.sequenceId', 'DESC')
            .limit(1)
            .getOne();
    }

    /** Returns the snapshot at the requested position, or null if not present. */
    async getBySequence(sequenceId: number): Promise<ExecutionSnapshot | null> {
        return this.repo.findOne({ where: { sequenceId } });
    }

    /** Returns snapshots ordered by ascending sequenceId. Pagination is optional. */
    async list(limit?: number, offset?: number): Promise<ExecutionSnapshot[]> {
        const qb = this.repo
            .createQueryBuilder('snap')
            .orderBy('snap.sequenceId', 'ASC');
        if (typeof limit === 'number') qb.limit(limit);
        if (typeof offset === 'number') qb.offset(offset);
        return qb.getMany();
    }

    /**
     * Replay the entire chain from genesis, recomputing each hash and comparing it to
     * the stored value. Returns `{ ok: true }` when the chain is intact; otherwise
     * `{ ok: false, brokenAt: sequenceId }` identifying the first divergent snapshot.
     */
    async reconstruct(): Promise<{ ok: boolean; brokenAt?: number }> {
        const snapshots = await this.list();
        let expectedPrevHash = '';
        for (const snap of snapshots) {
            const payloadJson = JSON.stringify(snap.payload);
            const expectedHash = sha256(payloadJson + expectedPrevHash + snap.sequenceId);
            if (snap.prevHash !== expectedPrevHash || snap.hash !== expectedHash) {
                return { ok: false, brokenAt: snap.sequenceId };
            }
            expectedPrevHash = snap.hash;
        }
        return { ok: true };
    }
}
