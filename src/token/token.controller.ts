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

    // ─── Canonical 1:1 Emission Endpoint ─────────────────────────────────────

    /**
     * POST /api/v1/token/transaction/emit
     *
     * Canonical entry point for ArosCoin emission.
     *
     * Lifecycle (atomic):
     *   1. MINT  emissionAmount (= txAmount, 1:1) → recipient
     *   2. FEE   nodeShare (75% of commission) → NODE_POOL
     *   3. FEE   afcShare  (25% of commission) → AFC_RESERVE
     *   4. BURN  emissionAmount → BURN_VAULT
     *
     * Net circulating supply change per call = 0 (transient ARO).
     */
    @Post('transaction/emit')
    async canonicalEmit(
        @Body() body: {
            transactionAmount: number;
            recipient: string;
            referenceId: string;
            commissionRate?: number;
        },
    ) {
        try {
            const result = await this.tokenService.mintForTransaction(
                body.transactionAmount,
                body.recipient,
                body.referenceId,
                body.commissionRate,
            );

            return {
                status:          'SUCCESS',
                referenceId:     body.referenceId,
                transactionAmount: result.transactionAmount,
                emissionAmount:  result.emissionAmount,
                commission:      result.commission,
                nodeShare:       result.nodeShare,
                afcReserveShare: result.afcReserveShare,
                commissionRate:  result.commissionRate,
                emissionPrice:   this.emissionService.getCurrentEmissionPrice(),
            };
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
        }
    }

    // ─── AFC Reserve State ───────────────────────────────────────────────────

    /**
     * GET /api/v1/token/emission/price
     *
     * Returns the current AFC reserve index (canonical emission price).
     * Formula: reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
     */
    @Get('emission/price')
    getEmissionPrice() {
        const state = this.emissionService.getAfcReserveState();
        return {
            reserveIndex:     state.reserveIndex,
            totalAfcReserve:  state.totalReserve,
            transactionCount: state.transactionCount,
            lastUpdated:      state.lastUpdated,
        };
    }

    // ─── Legacy Fiat Bridge Endpoints ────────────────────────────────────────
    // These operate on fiat-deposit / fiat-withdrawal flows (Bridge Layer) and
    // are intentionally separate from the canonical ARO emission lifecycle.

    @Post('settlement/clearing')
    async processInstitutionalSettlement(@Body() body: { batchId: string, totalVolume: number, counterparty: string }) {
        this.logger.log(`[Institutional Settlement] Processing Batch ${body.batchId} from ${body.counterparty}. Vol: ${body.totalVolume}`);
        return { status: 'CLEARED', settlementTime: Date.now(), finality: 'INSTANT_AFC' };
    }

    /** @deprecated Use POST /transaction/emit for canonical ARO emission. This endpoint serves fiat-deposit bridging only. */
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
