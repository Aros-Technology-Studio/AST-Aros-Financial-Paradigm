import { Controller, Get, Param, Post, HttpException, HttpStatus, Logger, ParseIntPipe } from '@nestjs/common';
import { FeeDistributionService } from './fee_distribution.service';

@Controller('fee-distribution')
export class FeeDistributionController {
    private readonly logger = new Logger(FeeDistributionController.name);

    constructor(private readonly feeDistributionService: FeeDistributionService) { }

    @Get('epoch/current')
    async getCurrentEpoch() {
        const epoch = await this.feeDistributionService.getCurrentEpoch();
        if (!epoch) {
            return { message: 'No active epoch found (System might be initializing)' };
        }
        return epoch;
    }

    @Get('epoch/:number')
    async getEpoch(@Param('number', ParseIntPipe) epochNumber: number) {
        const epoch = await this.feeDistributionService.getEpoch(epochNumber);
        if (!epoch) {
            throw new HttpException(`Epoch ${epochNumber} not found`, HttpStatus.NOT_FOUND);
        }
        return epoch;
    }

    /**
     * Dev/Admin: Manually trigger epoch rotation.
     * In production, this should be guarded by AuthGuard/AdminGuard.
     */
    @Post('trigger')
    async triggerEpochCycle() {
        this.logger.log('Manual trigger of Epoch Cycle received via API');
        try {
            await this.feeDistributionService.triggerEpochCycle();
            const newEpoch = await this.feeDistributionService.getCurrentEpoch();
            return { message: 'Cycle triggered successfully', newEpoch };
        } catch (error) {
            this.logger.error('Failed to trigger cycle manually', error);
            throw new HttpException(error.message || 'Internal Error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
