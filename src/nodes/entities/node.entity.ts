import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Permitted lifecycle states for a node, mirroring `reference/ast-core/src/types.ts`.
 * Influence and admission follow these states; payment continues to depend solely on
 * confirmed work and weight.
 */
export type NodeStatus = 'active' | 'penalized' | 'disconnected';

/**
 * NodeEntity — the persisted record of a registered participant in the AST workforce.
 *
 * Fields match `docs/specs/AST_Nodes_AGENT_EN.md` (data_model.NodeEntity):
 *   - `id`         primary identifier
 *   - `type`       declared role/type (validator, router, recorder, ...)
 *   - `uptime`     observed availability factor in [0, 1]
 *   - `successes`  count of confirmed-successful work units
 *   - `total`      count of all attempted work units
 *   - `status`     lifecycle marker
 *   - `weight`     current epoch weight used for proportional payment
 *   - `reputation` derived trust score (successes/total * uptime)
 *
 * Influence and income derive from executed work and reputation. This entity therefore
 * stores work-quality metrics only, in accordance with invariant I9 and prohibition P1.
 *
 * Spec: docs/specs/AST_Nodes_AGENT_EN.md
 * Reference: reference/ast-core/src/nodes.ts
 */
@Entity({ name: 'nodes' })
export class NodeEntity {
    /** Stable identifier assigned at registration. */
    @PrimaryColumn({ type: 'varchar', length: 128, name: 'id' })
    id!: string;

    /** Declared role of the node (e.g. 'validator', 'router', 'recorder'). */
    @Column({ type: 'varchar', length: 64, name: 'type' })
    type!: string;

    /** Observed availability factor; defaults to 1 (fully available). */
    @Column({ type: 'float', name: 'uptime', default: 1 })
    uptime!: number;

    /** Cumulative count of confirmed successful work units. */
    @Column({ type: 'integer', name: 'successes', default: 0 })
    successes!: number;

    /** Cumulative count of attempted work units. */
    @Column({ type: 'integer', name: 'total', default: 0 })
    total!: number;

    /** Lifecycle marker controlling admission and weighting. */
    @Column({ type: 'varchar', length: 32, name: 'status', default: 'active' })
    status!: NodeStatus;

    /** Current epoch weight used by Commission for proportional payment. */
    @Column({ type: 'float', name: 'weight', default: 1 })
    weight!: number;

    /** Derived trust score, refreshed on each recorded execution. */
    @Column({ type: 'float', name: 'reputation', default: 1 })
    reputation!: number;
}
