import { Controller, Post, Body, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { TokenService } from './token.service';

@Controller('api/v1/token')
export class TokenController {
    private readonly logger = new Logger(TokenController.name);

    constructor(private readonly tokenService: TokenService) { }

    /**
     * Canonical 1:1 emission endpoint.
     * Use for payment transactions — emit ARO 1:1, collect fee (75% nodes / 25% AFC), burn ARO.
     * Net circulating supply change = 0. AFC reserve grows → next emission price rises.
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

    @Post('settlement/clearing')
    async processInstitutionalSettlement(@Body() body: { batchId: string, totalVolume: number, counterparty: string }) {
        this.logger.log(`[Institutional Settlement] Processing Batch ${body.batchId} from ${body.counterparty}. Vol: ${body.totalVolume}`);
        return { status: 'CLEARED', settlementTime: Date.now(), finality: 'INSTANT_AFC' };
    }

    /**
     * @deprecated Use POST /emit for canonical payment transaction emission.
     * This endpoint is retained for FIAT_DEPOSIT flows only (external fiat → ARO held in wallet).
     */
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
