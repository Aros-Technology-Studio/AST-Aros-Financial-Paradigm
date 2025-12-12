import { Injectable, Logger } from '@nestjs/common';

export interface BankTransaction {
    amount: number;
    currency: string;
    referenceId: string;
    senderIban: string;
    recipientIban: string;
}

@Injectable()
export class FiatService {
    private readonly logger = new Logger(FiatService.name);

    async initiateBankTransfer(tx: BankTransaction): Promise<string> {
        this.logger.log(`Initiating bank transfer of ${tx.amount} ${tx.currency} from ${tx.senderIban} to ${tx.recipientIban} (Ref: ${tx.referenceId})`);
        // Mock API call
        return 'mock_bank_tx_id_' + Math.random().toString(36).substring(7);
    }

    async checkKycStatus(userId: string): Promise<boolean> {
        this.logger.log(`Checking KYC status for user ${userId}`);
        // Mock KYC check
        return true; // Default to approved for dev
    }

    async pollDepositStatus(referenceId: string): Promise<'PENDING' | 'COMPLETED' | 'FAILED'> {
        this.logger.log(`Polling status for deposit ${referenceId}`);
        return 'COMPLETED';
    }
}
