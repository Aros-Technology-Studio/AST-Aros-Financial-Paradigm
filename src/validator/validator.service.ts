import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Validator, ValidatorStatus } from './entities/validator.entity';
import { Stake, StakeState } from './entities/stake.entity';
import { Epoch, EpochStatus } from './entities/epoch.entity';

@Injectable()
export class ValidatorService {
    constructor(
        @InjectRepository(Validator)
        private readonly validatorRepo: Repository<Validator>,
        @InjectRepository(Stake)
        private readonly stakeRepo: Repository<Stake>,
        @InjectRepository(Epoch)
        private readonly epochRepo: Repository<Epoch>,
    ) { }

    // --- Validator Logic ---

    async registerValidator(data: { validator_id: string; pubkey: string }): Promise<Validator> {
        const existing = await this.validatorRepo.findOne({ where: { validator_id: data.validator_id } });
        if (existing) {
            throw new BadRequestException('Validator ID already exists');
        }

        const validator = this.validatorRepo.create({
            validator_id: data.validator_id,
            pubkey: data.pubkey,
            status: ValidatorStatus.PENDING,
            stake_amount: '0',
        });
        return this.validatorRepo.save(validator);
    }

    async getActiveValidators(): Promise<Validator[]> {
        return this.validatorRepo.find({ where: { status: ValidatorStatus.ACTIVE } });
    }

    async getValidator(id: string): Promise<Validator> {
        const v = await this.validatorRepo.findOne({ where: { validator_id: id } });
        if (!v) throw new NotFoundException('Validator not found');
        return v;
    }

    // --- Staking Logic ---

    async addStake(validatorId: string, amount: string): Promise<Stake> {
        const validator = await this.getValidator(validatorId);

        // Create stake record
        const stake = this.stakeRepo.create({
            validator,
            amount,
            state: StakeState.PENDING,
        });
        await this.stakeRepo.save(stake);

        // Update validator total stake (simplification: assume instant activation for MVP)
        const currentStake = parseFloat(validator.stake_amount);
        const addedStake = parseFloat(amount);
        validator.stake_amount = (currentStake + addedStake).toString();

        // Auto-activate if pending
        if (validator.status === ValidatorStatus.PENDING && parseFloat(validator.stake_amount) > 0) {
            validator.status = ValidatorStatus.ACTIVE;
        }

        await this.validatorRepo.save(validator);

        // Activate stake
        stake.state = StakeState.ACTIVE;
        return this.stakeRepo.save(stake);
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

    async endEpoch(rewards: string): Promise<Epoch> {
        const activeEpoch = await this.epochRepo.findOne({ where: { status: EpochStatus.ACTIVE } });
        if (!activeEpoch) {
            throw new BadRequestException('No active epoch to end');
        }

        activeEpoch.status = EpochStatus.FINALIZED;
        activeEpoch.end_time = new Date();
        activeEpoch.total_rewards = rewards;

        return this.epochRepo.save(activeEpoch);
    }
}
