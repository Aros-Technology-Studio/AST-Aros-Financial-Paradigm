import { Injectable, Logger, BadRequestException, UnauthorizedException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BridgeRequest, BridgeRequestStatus, BridgeRequestType } from './entities/bridge_request.entity';
import { TokenService } from '../token/token.service';

@Injectable()
export class BridgeService {
    private readonly logger = new Logger(BridgeService.name);

    // В реальном продакшене это должно быть в переменной окружения!
    private readonly BB_API_SECRET = 'super_secret_bb_key_123';

    constructor(
        @InjectRepository(BridgeRequest)
        private readonly bridgeRepo: Repository<BridgeRequest>,
        @Inject(forwardRef(() => TokenService))
        private readonly tokenService: TokenService,
    ) { }

    /**
     * Обработка вебхука о депозите (Вход денег в Банк -> Эмиссия токенов).
     */
    async handleFiatDepositWebhook(payload: any, apiKey: string): Promise<any> {
        // 1. Security Check
        if (apiKey !== this.BB_API_SECRET) {
            this.logger.warn(`Unauthorized deposit attempt. IP tracking enabled.`);
            throw new UnauthorizedException('Invalid Banking Block API Key');
        }

        const { transactionId, amount, currency, userWallet } = payload;

        // 2. Idempotency Check (проверка на дубликаты)
        const existing = await this.bridgeRepo.findOneBy({ externalReference: transactionId });
        if (existing) {
            if (existing.status === BridgeRequestStatus.PROCESSED) {
                return { status: 'ALREADY_PROCESSED', txHash: existing.relatedTxHash };
            }
            throw new ConflictException('Request with this Reference ID already exists');
        }

        // 3. Создаем запись запроса
        const request = this.bridgeRepo.create({
            externalReference: transactionId,
            type: BridgeRequestType.DEPOSIT,
            amount: amount.toString(),
            fiatCurrency: currency,
            targetWallet: userWallet,
            rawPayload: payload,
            status: BridgeRequestStatus.PENDING
        });
        await this.bridgeRepo.save(request);

        try {
            // 4. Canonical 1:1 emission: mint → fee split (75/25) → burn
            await this.tokenService.mintForTransaction(
                parseFloat(request.amount),
                request.targetWallet,
                request.externalReference,
            );

            // 5. Обновляем статус на SUCCESS
            request.status = BridgeRequestStatus.PROCESSED;
            request.relatedTxHash = request.externalReference;
            await this.bridgeRepo.save(request);

            this.logger.log(`Deposit processed via Bridge. Ref: ${transactionId}, TX: ${request.externalReference}`);
            return { success: true, txHash: request.externalReference };

        } catch (error) {
            // 6. Обработка ошибок
            request.status = BridgeRequestStatus.FAILED;
            request.processingError = error.message;
            await this.bridgeRepo.save(request);

            this.logger.error(`Bridge deposit failed: ${error.message}`);
            throw new BadRequestException(`Processing failed: ${error.message}`);
        }
    }

    /**
     * Получить статус заявки по ID банка
     */
    async getRequestStatus(externalRef: string) {
        return this.bridgeRepo.findOneBy({ externalReference: externalRef });
    }

    /**
     * Send a payout request to the Banking Block (Simulated)
     */
    async requestFiatPayout(amount: string, bankDetailsId: string): Promise<string> {
        this.logger.log(`Sending Payout Request to Bank. Amount: ${amount}, Details: ${bankDetailsId}`);

        // Mocking an external HTTP call
        return new Promise((resolve) => {
            setTimeout(() => {
                const bankTxId = `BANK_TX_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                this.logger.log(`Bank accepted payout. Transaction ID: ${bankTxId}`);
                resolve(bankTxId);
            }, 500);
        });
    }
}
