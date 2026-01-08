import { AiProviderInterface, AnalysisResult } from '../interfaces/ai_provider.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OpenAiProvider implements AiProviderInterface {
    private readonly logger = new Logger(OpenAiProvider.name);

    getProviderId(): string {
        return 'OPENAI';
    }

    async analyzeText(prompt: string): Promise<AnalysisResult> {
        this.logger.log(`[OpenAI] Analyzing text: ${prompt.substring(0, 50)}...`);
        return this.simulateAnalysis(prompt);
    }

    async scoreEvent(eventData: any): Promise<AnalysisResult> {
        this.logger.log(`[OpenAI] Scoring event: ${JSON.stringify(eventData)}`);
        return this.simulateAnalysis(JSON.stringify(eventData));
    }

    private simulateAnalysis(input: string): AnalysisResult {
        const isRisk = input.toLowerCase().includes('hack') || input.toLowerCase().includes('drain');
        return {
            riskScore: isRisk ? 0.92 : 0.1,
            flags: isRisk ? ['EXPLOIT_PATTERN'] : ['SAFE'],
            summary: isRisk ? 'Potential exploit logic identified.' : 'Standard operational pattern.',
            confidence: 0.95
        };
    }
}
