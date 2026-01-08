import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { SmartContractEventEntity } from './entities/smart_contract_event.entity';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { AROS_COIN_ABI } from './smart_contract.abi';

/**
 * Service to interact with the External Reserve Interface (ArosCoinReserveManager).
 * Uses ethers.js for network communication and persistent storage for local verification.
 */
@Injectable()
export class SmartContractIntegration implements OnModuleInit {
    private readonly logger = new Logger(SmartContractIntegration.name);
    private contract: ethers.Contract | null = null;
    private wallet: ethers.Wallet | null = null;
    private nonceTracker: number | null = null;

    constructor(
        @InjectRepository(SmartContractEventEntity)
        private readonly eventRepo: Repository<SmartContractEventEntity>,
        private readonly configService: ConfigService,
    ) { }

    async onModuleInit() {
        await this.initializeContract();
    }

    private async initializeContract() {
        const rpcUrl = this.configService.get<string>('EVM_RPC_URL');
        const privateKey = this.configService.get<string>('EVM_PRIVATE_KEY');
        const contractAddress = this.configService.get<string>('EVM_CONTRACT_ADDRESS');

        if (rpcUrl && privateKey && contractAddress) {
            try {
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                this.wallet = new ethers.Wallet(privateKey, provider);
                this.contract = new ethers.Contract(contractAddress, AROS_COIN_ABI, this.wallet);
                // Initialize Nonce Tracker
                this.nonceTracker = await this.wallet.getNonce('latest'); // Start from latest mined
                this.logger.log(`[SmartContract] Connected to External Interface at ${contractAddress}. Initial Nonce: ${this.nonceTracker}`);
            } catch (error) {
                this.logger.error(`[SmartContract] Failed to initialize connection: ${error.message}`);
            }
        } else {
            this.logger.warn(`[SmartContract] EVM configuration missing. Running in SIMULATION mode.`);
        }
    }

    /**
     * Checks if a reference ID has already been used in the smart contract.
     */
    async isReferenceUsed(refId: string): Promise<boolean> {
        const hash = this.hashReference(refId);

        // 1. Check Local DB first (faster)
        const localExists = await this.eventRepo.exist({ where: { transactionHash: hash } });
        if (localExists) return true;

        // 2. Check External Contract if available
        if (this.contract) {
            try {
                // Ensure hash is prefixed with 0x for bytes32
                const bytes32Hash = `0x${hash}`;
                const used = await this.contract.isReferenceUsed(bytes32Hash);
                return used;
            } catch (error) {
                this.logger.error(`[SmartContract] External check failed: ${error.message}`);
                return false; // Fallback or throw based on strictness
            }
        }

        return false;
    }

    /**
     * Records a reference as used, simulating a transaction (Mint/Burn).
     */
    async recordReference(refId: string, type: 'MINT' | 'BURN', params: any): Promise<void> {
        const hash = this.hashReference(refId);
        const bytes32Hash = `0x${hash}`;

        // 1. Execute on External Contract
        if (this.contract) {
            try {
                // Note: For prototype, we assume the wallet has permission (Owner)
                // params.to / params.from must be valid Ethereum addresses for this to work
                // If not provided in params, we might need a default or error
                const targetAddress = params.to || params.from || this.wallet?.address;
                const amount = ethers.parseUnits(params.amount?.toString() || '0', 18); // Assume 18 decimals

                this.logger.log(`[SmartContract] Sending ${type} tx for ${refId}...`);

                let tx;
                const nonce = this.nonceTracker!;
                this.nonceTracker = nonce + 1; // Increment immediately

                if (type === 'MINT') {
                    tx = await this.contract.mint(targetAddress, amount, bytes32Hash, { nonce });
                } else {
                    tx = await this.contract.burnWithReference(targetAddress, amount, bytes32Hash, { nonce });
                }

                await tx.wait();
                this.logger.log(`[SmartContract] External ${type} confirmed: ${tx.hash}`);

            } catch (error) {
                this.logger.error(`[SmartContract] External execution failed: ${error.message}`);
                throw new Error(`External Reserve Interface Error: ${error.message}`);
            }
        } else {
            this.logger.debug(`[SmartContract] Simulation: Skipping external call for ${refId}`);
        }

        // 2. Record in Local DB
        try {
            const event = this.eventRepo.create({
                transactionHash: hash,
                method: type,
                params: params,
                status: 'SUCCESS'
            });
            await this.eventRepo.save(event);
            this.logger.log(`[SmartContract] Database recorded ${type} reference ${refId}`);
        } catch (error) {
            this.logger.error(`Failed to record reference locally: ${error.message}`);
            // If external succeeded but local failed, we have an inconsistency. 
            // Ideally we'd rollback external, but that's hard. 
            // For now, we throw to alert caller.
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
