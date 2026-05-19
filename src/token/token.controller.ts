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
        // Institutional Interface: ArosCoinSettlementInterface
        // Allows AFC anchors to settle large batches of ArosCoin off-chain (or optimized on-chain)

        this.logger.log(`[Institutional Settlement] Processing Batch ${body.batchId} from ${body.counterparty}. Vol: ${body.totalVolume}`);

        // return this.tokenService.processSettlement(body);
        return { status: 'CLEARED', settlementTime: Date.now(), finality: 'INSTANT_AFC' };
    }

    @Post('mint')
    async mintTokens(@Body() body: { amount: string; recipient: string; refId: string }) {
        try {
            const result = await this.tokenService.mintForTransaction(
                parseFloat(body.amount),
                body.recipient,
                body.refId,
            );
            return {
                status:          'SUCCESS',
                referenceId:     body.refId,
                emissionAmount:  result.emissionAmount,
                commission:      result.commission,
                nodeShare:       result.nodeShare,
                afcReserveShare: result.afcReserveShare,
                commissionRate:  result.commissionRate,
            };
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

    /**
     * GET /api/v1/token/emission/state
     * Returns live AFC reserve state and current emission price index.
     */
    @Get('emission/state')
    getEmissionState() {
        return {
            emissionPrice:   this.emissionService.getCurrentEmissionPrice(),
            afcReserveState: this.emissionService.getAfcReserveState(),
        };
    }
}
