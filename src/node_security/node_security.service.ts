import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValidationNode, NodeStatus } from './entities/validation_node.entity';
import { SecurityDeposit, SecurityDepositState } from './entities/security_deposit.entity';
import { Epoch, EpochStatus } from './entities/epoch.entity';

@Injectable()
export class NodeSecurityService {
    private readonly logger = new Logger(NodeSecurityService.name);

    constructor(
        @InjectRepository(ValidationNode)
        private readonly nodeRepo: Repository<ValidationNode>,
        @InjectRepository(SecurityDeposit)
        private readonly depositRepo: Repository<SecurityDeposit>,
        @InjectRepository(Epoch)
        private readonly epochRepo: Repository<Epoch>,
    ) { }

    // --- Node Logic ---

    async registerNode(data: { node_id: string; pubkey: string }): Promise<ValidationNode> {
        const existing = await this.nodeRepo.findOne({ where: { node_id: data.node_id } });
        if (existing) {
            throw new BadRequestException('Node ID already exists');
        }

        const node = this.nodeRepo.create({
            node_id: data.node_id,
            pubkey: data.pubkey,
            status: NodeStatus.PENDING,
            security_deposit_amount: '0',
        });
        return this.nodeRepo.save(node);
    }

    async getActiveNodes(): Promise<ValidationNode[]> {
        return this.nodeRepo.find({ where: { status: NodeStatus.ACTIVE } });
    }

    async getNode(id: string): Promise<ValidationNode> {
        const v = await this.nodeRepo.findOne({ where: { node_id: id } });
        if (!v) throw new NotFoundException('Validation Node not found');
        return v;
    }

    // --- Security Deposit Logic ---

    async addSecurityDeposit(nodeId: string, amount: string): Promise<SecurityDeposit> {
        const node = await this.getNode(nodeId);

        // Create deposit record
        const deposit = this.depositRepo.create({
            node,
            amount,
            state: SecurityDepositState.PENDING,
        });
        await this.depositRepo.save(deposit);

        // Update node total deposit
        const currentDeposit = parseFloat(node.security_deposit_amount);
        const addedDeposit = parseFloat(amount);
        node.security_deposit_amount = (currentDeposit + addedDeposit).toString();

        // Auto-activate if pending and has deposit
        if (node.status === NodeStatus.PENDING && parseFloat(node.security_deposit_amount) > 0) {
            node.status = NodeStatus.ACTIVE;
        }

        await this.nodeRepo.save(node);

        // Activate deposit
        deposit.state = SecurityDepositState.ACTIVE;
        return this.depositRepo.save(deposit);
    }

    /**
     * AFC THESIS: No direct asset control. Only Signal of Non-Compliance.
     * This method records the signal but DOES NOT burn funds directly.
     * It defers to the Bridge/Smart Contract layer.
     */
    async signalNonCompliance(nodeId: string, reason: string, severity: 'LOW' | 'HIGH' | 'CRITICAL'): Promise<void> {
        const node = await this.getNode(nodeId);
        this.logger.warn(`SIGNAL OF NON-COMPLIANCE: Node ${node.node_id} - Reason: ${reason} [Severity: ${severity}]`);

        // In a real implementation, this would emit an event to the Bridge Oracle or Oversight Agent.
        // For MVP, we log and mark the node as FORFEITED if Critical.

        if (severity === 'CRITICAL') {
            node.status = NodeStatus.FORFEITED;
            await this.nodeRepo.save(node);

            // Mark deposits as Forfeited (Logical state only)
            const deposits = await this.depositRepo.find({ where: { node: { node_id: nodeId }, state: SecurityDepositState.ACTIVE } });
            for (const d of deposits) {
                d.state = SecurityDepositState.FORFEITED;
                await this.depositRepo.save(d);
            }
        }
    }

    // --- Epoch Logic (Simplified) ---

    async startEpoch(): Promise<Epoch> {
        const activeEpoch = await this.epochRepo.findOne({ where: { status: EpochStatus.ACTIVE } });
        if (activeEpoch) {
            throw new BadRequestException('An epoch is already active');
        }

        const epoch = this.epochRepo.create({
            start_time: new Date(),
            status: EpochStatus.ACTIVE,
        });
        return this.epochRepo.save(epoch);
    }

    // Renamed 'rewards' to 'payments'
    async endEpoch(payments: string): Promise<Epoch> {
        const activeEpoch = await this.epochRepo.findOne({ where: { status: EpochStatus.ACTIVE } });
        if (!activeEpoch) {
            throw new BadRequestException('No active epoch to end');
        }

        activeEpoch.status = EpochStatus.FINALIZED;
        activeEpoch.end_time = new Date();
        activeEpoch.total_payments = payments;

        return this.epochRepo.save(activeEpoch);
    }
}
