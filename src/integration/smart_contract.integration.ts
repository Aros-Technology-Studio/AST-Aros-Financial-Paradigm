
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { SmartContractEventEntity } from './entities/smart_contract_event.entity';

/**
 * Service to simulate interactions with the ArosCoinReserveManager smart contract.
 * Uses persistent storage to track "On-Chain" events.
 */
@Injectable()
export class SmartContractIntegration {
    private readonly logger = new Logger(SmartContractIntegration.name);

    constructor(
        @InjectRepository(SmartContractEventEntity)
        private readonly eventRepo: Repository<SmartContractEventEntity>,
    ) { }

    /**
     * Checks if a reference ID has already been used in the smart contract.
     */
    async isReferenceUsed(refId: string): Promise<boolean> {
        const hash = this.hashReference(refId);
        const exists = await this.eventRepo.exist({ where: { transactionHash: hash } });
        this.logger.debug(`[SmartContract] Checking reference ${refId} (hash: ${hash}): ${exists}`);
        return exists;
    }

    /**
     * Records a reference as used, simulating a transaction (Mint/Burn).
     */
    async recordReference(refId: string, type: 'MINT' | 'BURN', params: any): Promise<void> {
        const hash = this.hashReference(refId);

        try {
            const event = this.eventRepo.create({
                transactionHash: hash,
                method: type, // 'MINT' or 'BURN' as method for simplicity
                params: params,
                status: 'SUCCESS'
            });
            await this.eventRepo.save(event);
            this.logger.log(`[SmartContract] Recorded ${type} reference ${refId} (hash: ${hash})`);
        } catch (error) {
            // Unlikely collision if isReferenceUsed checked before, but handle generic db errors
            this.logger.error(`Failed to record reference: ${error.message}`);
            throw error;
        }
    }

    /**
     * Simulates validating the Reserve.
     * Calculates "On-Chain" supply (Minted - Burned) and returns it.
     */
    async validateReserve(): Promise<{ isValid: boolean, onChainSupply: number }> {
        // Calculate Totals from Events
        const mints = await this.eventRepo.find({ where: { method: 'MINT' } });
        const burns = await this.eventRepo.find({ where: { method: 'BURN' } });

        const totalMinted = mints.reduce((acc, ev) => acc + (parseFloat(ev.params['amount'] || 0)), 0);
        const totalBurned = burns.reduce((acc, ev) => acc + (parseFloat(ev.params['amount'] || 0)), 0);

        const onChainSupply = totalMinted - totalBurned;

        this.logger.log(`[SmartContract] Reserve Validation: +${totalMinted} / -${totalBurned} = ${onChainSupply} Supply`);

        // For now, always valid as we are the source of truth in this prototype
        return { isValid: true, onChainSupply };
    }

    private hashReference(refId: string): string {
        return crypto.createHash('sha256').update(refId).digest('hex');
    }
}
