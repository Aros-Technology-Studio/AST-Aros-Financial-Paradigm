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

    /**
     * Canonical 1:1 emission endpoint.
     * Called when a payment transaction is processed:
     *   emit = txAmount (1:1) → fee split 75/25 → burn emitted ARO
     *   AFC reserve grows → next emission price rises
     */
    @Post('emit')
    async emitForTransaction(
        @Body() body: { transactionAmount: number; recipient: string; referenceId: string; commissionRate?: number },
    ) {
        const { transactionAmount, recipient, referenceId, commissionRate } = body;
        if (!transactionAmount || !recipient || !referenceId) {
            throw new HttpException('transactionAmount, recipient and referenceId are required', HttpStatus.BAD_REQUEST);
        }
        try {
            const result = await this.tokenService.mintForTransaction(
                transactionAmount,
                recipient,
                referenceId,
                commissionRate,
            );
            return {
                status:           'EMITTED',
                referenceId,
                transactionAmount: result.transactionAmount,
                emissionAmount:    result.emissionAmount,
                commission:        result.commission,
                nodeShare:         result.nodeShare,
                afcReserveShare:   result.afcReserveShare,
                commissionRate:    result.commissionRate,
                emissionPrice:     this.emissionService.getCurrentEmissionPrice(),
            };
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Post('settlement/clearing')
    async processInstitutionalSettlement(@Body() body: { batchId: string, totalVolume: number, counterparty: string }) {
        this.logger.log(`[Institutional Settlement] Processing Batch ${body.batchId} from ${body.counterparty}. Vol: ${body.totalVolume}`);
        return { status: 'CLEARED', settlementTime: Date.now(), finality: 'INSTANT_AFC' };
    }

    /** Fiat-deposit mint (non-canonical). Tokens are persistent, not transient. */
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
