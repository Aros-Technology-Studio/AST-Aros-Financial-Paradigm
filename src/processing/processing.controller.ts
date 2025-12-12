import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ProcessingService } from './processing.service';

@Controller('processing')
export class ProcessingController {
    constructor(private readonly processingService: ProcessingService) { }

    @Post('transaction')
    async submitTransaction(@Body() body: any) {
        const isValid = await this.processingService.validateTransaction(body);
        if (!isValid) {
            throw new HttpException('Invalid transaction signature or structure', HttpStatus.BAD_REQUEST);
        }
        return { status: 'accepted', txHash: body.txHash || 'simulation_hash' };
    }

    @Post('rollback')
    async initiateRollback(@Body() body: { txHash: string; reason: string }) {
        await this.processingService.triggerRollback(body.txHash, body.reason);
        return { status: 'rollback_initiated', txHash: body.txHash };
    }
}
