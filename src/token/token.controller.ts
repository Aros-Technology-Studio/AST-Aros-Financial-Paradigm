import { Controller, Post, Body, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { TokenService } from './token.service';
import { EmissionService } from './emission.service';

@Controller('api/v1/token')
export class TokenController {
    private readonly logger = new Logger(TokenController.name);

    constructor(
        private readonly tokenService: TokenService,
        private readonly emissionService: EmissionService,
    ) { }

    @Post('settlement/clearing')
    async processInstitutionalSettlement(@Body() body: { batchId: string, totalVolume: number, counterparty: string }) {
        this.logger.log(`[Institutional Settlement] Processing Batch ${body.batchId} from ${body.counterparty}. Vol: ${body.totalVolume}`);
        return { status: 'CLEARED', settlementTime: Date.now(), finality: 'INSTANT_AFC' };
    }

    /**
     * Canonical 1:1 emission endpoint.
     * Replaces legacy /mint — applies full canonical flow:
     *   emit = amount (1:1), fee split 75% nodes / 25% AFC, burn after TX.
     */
    @Post('mint')
    async mintTokens(@Body() body: { amount: string; recipient: string; refId: string; commissionRate?: number }) {
        try {
            const txAmount = parseFloat(body.amount);
            return await this.tokenService.mintForTransaction(
                txAmount,
                body.recipient,
                body.refId,
                body.commissionRate,
            );
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
        }
    }

    /** Returns current AFC reserve state and emission price index. */
    @Get('emission/state')
    getEmissionState() {
        return {
            afcReserveState:   this.emissionService.getAfcReserveState(),
            currentEmissionPrice: this.emissionService.getCurrentEmissionPrice(),
        };
    }

    @Post('burn')
    async burnTokens(@Body() body: { amount: string; sender: string; bankDetailsId: string }) {
        try {
            return await this.tokenService.burn(body.amount, body.sender, body.bankDetailsId);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('supply')
    async getSupply() {
        return this.tokenService.getSupplyStats();
    }
}
