import { AiProviderInterface, AnalysisResult } from '../interfaces/ai_provider.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GrokProvider implements AiProviderInterface {
    private readonly logger = new Logger(GrokProvider.name);

    getProviderId(): string {
        return 'GROK';
    }

    async analyzeText(prompt: string): Promise<AnalysisResult> {
        this.logger.log(`[Grok] Analyzing text: ${prompt.substring(0, 50)}...`);
        return {
            riskScore: 0.0,
            flags: ['SARCASM_DETECTED_BUT_BENIGN'],
            summary: 'Looks fun.',
            confidence: 0.69
        };
    }

    async scoreEvent(eventData: any): Promise<AnalysisResult> {
        return { riskScore: 0.0, flags: [], summary: 'No issues.', confidence: 1.0 };
    }
}
