import { Injectable, Logger } from '@nestjs/common';
import { TokenService } from '../../token/token.service';

@Injectable()
export class IngestionService {
    private readonly logger = new Logger(IngestionService.name);

    constructor(private readonly tokenService: TokenService) {}

    /**
     * Ingestion of external crypto assets (Module 09).
     * Each ingestion triggers a canonical 1:1 ARO emission.
     */
    async ingestAsset(assetSymbol: string, amount: number, senderAddress: string): Promise<boolean> {
        this.logger.log(`Ingesting ${amount} ${assetSymbol} from ${senderAddress}...`);

        if (!['WBTC', 'USDT', 'ETH'].includes(assetSymbol)) {
            this.logger.warn(`Asset ${assetSymbol} not supported for ingestion.`);
            return false;
        }

        const rate = this.getMockRate(assetSymbol);
        const aroAmount = amount * rate;
        const referenceId = `INGEST_${assetSymbol}_${senderAddress}_${Date.now()}`;

        this.logger.log(`Swap Rate: 1 ${assetSymbol} = ${rate} AROS. Triggering canonical emission of ${aroAmount} AROS...`);

        // Canonical 1:1 emission: mint ARO → 75/25 fee split → AFC reserve update → burn ARO
        await this.tokenService.mintForTransaction(aroAmount, senderAddress, referenceId);

        return true;
    }

    private getMockRate(symbol: string): number {
        switch (symbol) {
            case 'WBTC': return 50000;
            case 'ETH': return 3000;
            case 'USDT': return 1;
            default: return 0;
        }
    }
}
