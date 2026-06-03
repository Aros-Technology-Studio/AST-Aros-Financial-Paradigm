import { Injectable, Logger } from '@nestjs/common';
import { TokenService } from '../../token/token.service';

@Injectable()
export class IngestionService {
    private readonly logger = new Logger(IngestionService.name);

    constructor(private readonly tokenService: TokenService) {}

    /**
     * Ingests an external crypto asset and mints ARO via the canonical 1:1 emission model.
     * Replaces the legacy commented-out tokenService.mint() call with the canonical entry point.
     */
    async ingestAsset(assetSymbol: string, amount: number, senderAddress: string): Promise<boolean> {
        this.logger.log(`Ingesting ${amount} ${assetSymbol} from ${senderAddress}...`);

        if (!['WBTC', 'USDT', 'ETH'].includes(assetSymbol)) {
            this.logger.warn(`Asset ${assetSymbol} not supported for ingestion.`);
            return false;
        }

        const rate       = this.getMockRate(assetSymbol);
        const mintedAros = amount * rate;
        const referenceId = `INGEST_${assetSymbol}_${Date.now()}`;

        this.logger.log(`Swap Rate: 1 ${assetSymbol} = ${rate} AROS. Minting ${mintedAros} AROS via canonical emission...`);

        await this.tokenService.mintForTransaction(mintedAros, senderAddress, referenceId);

        return true;
    }

    private getMockRate(symbol: string): number {
        switch (symbol) {
            case 'WBTC': return 50000;
            case 'ETH':  return 3000;
            case 'USDT': return 1;
            default:     return 0;
        }
    }
}
