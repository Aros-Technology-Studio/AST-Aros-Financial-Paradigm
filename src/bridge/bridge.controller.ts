import { Controller, Post, Body, Headers, Get, Param, UseGuards } from '@nestjs/common';
import { BridgeService } from './bridge.service';

@Controller('api/v1/bridge')
export class BridgeController {
    constructor(private readonly bridgeService: BridgeService) { }

    /**
     * Webhook для BB. Вызывается банком, когда клиент пополнил счет.
     */
    @Post('webhook/deposit')
    async handleDeposit(
        @Body() body: any,
        @Headers('x-api-key') apiKey: string
    ) {
        // Ожидаем JSON: { "transactionId": "123", "amount": 100.00, "currency": "USD", "userWallet": "0x..." }
        return this.bridgeService.handleFiatDepositWebhook(body, apiKey);
    }

    @Get('status/:refId')
    async getStatus(@Param('refId') refId: string) {
        return this.bridgeService.getRequestStatus(refId);
    }
}
