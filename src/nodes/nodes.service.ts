import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NodeChainService } from '../nodechain/nodechain.service';
import { NodeEntity } from './entities/node.entity';

/**
 * NodesService — the workforce registry of AST Model 1.
 *
 * Mirrors `reference/ast-core/src/nodes.ts`:
 *   - `register(id, type)`          admits a new node with default metrics
 *   - `list()`                       returns every registered node
 *   - `recordExecution(id, success)` increments work counters and refreshes reputation
 *   - `currentWeight(id)`            returns the node's present epoch weight
 *   - `receivePayment(id, amount)`   logs a post-factum payment receipt on NodeChain
 *
 * Reputation formula (per spec): `reputation = successes/total * uptime`
 * (returns 1 when `total === 0`, matching the reference's "fresh node" semantics).
 *
 * Influence here flows purely from confirmed work and reputation: the entity holds no
 * stake or stakedBalance column and the service never mutates a token balance to
 * reward or punish a node. That keeps invariant I9 and prohibitions P1/P2 intact.
 *
 * Spec: docs/specs/AST_Nodes_AGENT_EN.md
 * Reference: reference/ast-core/src/nodes.ts
 */
@Injectable()
export class NodesService {
    constructor(
        @InjectRepository(NodeEntity)
        private readonly repo: Repository<NodeEntity>,
        private readonly nodeChain: NodeChainService,
    ) { }

    /**
     * Admit a node into the registry with default metrics (uptime=1, successes=0,
     * total=0, status=active, weight=1, reputation=1) and write a `'node.registered'`
     * snapshot to NodeChain so the admission is part of the append-only history.
     */
    async register(id: string, type: string): Promise<NodeEntity> {
        const entity = this.repo.create({
            id,
            type,
            uptime: 1,
            successes: 0,
            total: 0,
            status: 'active',
            weight: 1,
            reputation: 1,
        });
        const saved = await this.repo.save(entity);
        await this.nodeChain.append('node.registered', {
            nodeId: saved.id,
            type: saved.type,
            uptime: saved.uptime,
            reputation: saved.reputation,
            weight: saved.weight,
        });
        return saved;
    }

    /** Returns every registered node in insertion order. */
    async list(): Promise<NodeEntity[]> {
        return this.repo.find();
    }

    /** Returns a node by id, or null when no such node is registered. */
    async get(id: string): Promise<NodeEntity | null> {
        return this.repo.findOne({ where: { id } });
    }

    /**
     * Record one unit of attempted work and refresh the derived trust score.
     * `total` always increments; `successes` increments only when the work succeeded.
     * Reputation is then recomputed deterministically as `successes/total * uptime`.
     */
    async recordExecution(id: string, success: boolean): Promise<NodeEntity> {
        const node = await this.requireNode(id);
        node.total += 1;
        if (success) {
            node.successes += 1;
        }
        node.reputation = this.computeReputation(node.successes, node.total, node.uptime);
        node.weight = this.computeWeight(node.reputation, node.uptime);
        return this.repo.save(node);
    }

    /**
     * Return the node's present epoch weight. Weight derives from reputation and
     * uptime (work + availability), never from a held balance.
     */
    async currentWeight(id: string): Promise<number> {
        const node = await this.requireNode(id);
        return node.weight;
    }

    /**
     * Record a post-factum payment receipt on NodeChain. The node retains earned
     * value off-balance per P6/I9, so this method intentionally leaves the persisted
     * NodeEntity fields untouched — only an append-only NodeChain event is written.
     */
    async receivePayment(id: string, amount: number): Promise<void> {
        const node = await this.requireNode(id);
        await this.nodeChain.append('node.payment.received', {
            nodeId: node.id,
            amount,
            weight: node.weight,
        });
    }

    /** Deterministic reputation formula matching the reference. */
    private computeReputation(successes: number, total: number, uptime: number): number {
        if (total === 0) {
            return 1;
        }
        return (successes / total) * uptime;
    }

    /** Weight derives from work quality (reputation) and availability (uptime). */
    private computeWeight(reputation: number, uptime: number): number {
        return reputation * uptime;
    }

    private async requireNode(id: string): Promise<NodeEntity> {
        const node = await this.repo.findOne({ where: { id } });
        if (!node) {
            throw new NotFoundException(`Node ${id} is not registered`);
        }
        return node;
    }
}
