import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { TokenService } from '../../token/token.service';

@Injectable()
export class IngestionService {
    private readonly logger = new Logger(IngestionService.name);

    constructor(
        @Inject(forwardRef(() => TokenService))
        private readonly tokenService: TokenService,
    ) {}

    /**
     * Ingest an external crypto asset and trigger canonical 1:1 ARO emission.
     * The converted AROS amount becomes the transaction amount for emission:
     *   Emit = mintedAros (1:1), Fee = mintedAros × 0.5% (75% nodes / 25% AFC reserve)
     *   ARO burn occurs atomically after settlement.
     */
    async ingestAsset(assetSymbol: string, amount: number, senderAddress: string): Promise<boolean> {
        this.logger.log(`Ingesting ${amount} ${assetSymbol} from ${senderAddress}...`);

        if (!['WBTC', 'USDT', 'ETH'].includes(assetSymbol)) {
            this.logger.warn(`Asset ${assetSymbol} not supported for ingestion.`);
            return false;
        }

        const rate = this.getMockRate(assetSymbol);
        const mintedAros = amount * rate;
        const referenceId = `INGEST_${assetSymbol}_${Date.now()}`;

        this.logger.log(`Swap Rate: 1 ${assetSymbol} = ${rate} AROS. Triggering canonical emission of ${mintedAros} AROS...`);

        await this.tokenService.mintForTransaction(mintedAros, senderAddress, referenceId);

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
