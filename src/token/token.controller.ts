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
     * Use this for all payment transactions — triggers the full lifecycle:
     * mint (1:1) → commission split (75% nodes / 25% AFC) → burn → reserve index update.
     */
    @Post('emit')
    async emitForTransaction(
        @Body() body: { transactionAmount: number; recipient: string; referenceId: string; commissionRate?: number },
    ) {
        try {
            return await this.tokenService.mintForTransaction(
                body.transactionAmount,
                body.recipient,
                body.referenceId,
                body.commissionRate,
            );
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
        }
    }

    /** Current AFC reserve state (price index, total reserve, transaction count). */
    @Get('emission/reserve')
    getAfcReserveState() {
        return this.emissionService.getAfcReserveState();
    }

    /** Current emission price derived from AFC reserve index. */
    @Get('emission/price')
    getCurrentEmissionPrice() {
        return { emissionPrice: this.emissionService.getCurrentEmissionPrice() };
    }

    /** Legacy direct mint (fiat deposit path — does not apply canonical emission lifecycle). */
    @Post('mint')
    async mintTokens(@Body() body: { amount: string; recipient: string; refId: string }) {
        try {
            return await this.tokenService.mint(body.amount, body.recipient, body.refId);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
        }
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
