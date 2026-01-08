import { AiProviderInterface, AnalysisResult } from '../interfaces/ai_provider.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AmazonBedrockProvider implements AiProviderInterface {
    private readonly logger = new Logger(AmazonBedrockProvider.name);

    getProviderId(): string {
        return 'AMAZON_BEDROCK';
    }

    async analyzeText(prompt: string): Promise<AnalysisResult> {
        this.logger.log(`[Bedrock] Analyzing text: ${prompt.substring(0, 50)}...`);
        return {
            riskScore: 0.1,
            flags: [],
            summary: 'Valid business logic.',
            confidence: 0.90
        };
    }

    async scoreEvent(eventData: any): Promise<AnalysisResult> {
        return { riskScore: 0.1, flags: [], summary: 'Valid.', confidence: 0.90 };
    }
}
