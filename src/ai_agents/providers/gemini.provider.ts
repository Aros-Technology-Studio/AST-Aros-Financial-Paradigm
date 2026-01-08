import { AiProviderInterface, AnalysisResult } from '../interfaces/ai_provider.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GeminiProvider implements AiProviderInterface {
    private readonly logger = new Logger(GeminiProvider.name);

    getProviderId(): string {
        return 'GEMINI';
    }

    async analyzeText(prompt: string): Promise<AnalysisResult> {
        this.logger.log(`[Gemini] Analyzing text: ${prompt.substring(0, 50)}...`);
        // Simulation Logic
        return this.simulateAnalysis(prompt);
    }

    async scoreEvent(eventData: any): Promise<AnalysisResult> {
        this.logger.log(`[Gemini] Scoring event: ${JSON.stringify(eventData)}`);
        return this.simulateAnalysis(JSON.stringify(eventData));
    }

    private simulateAnalysis(input: string): AnalysisResult {
        // Mock Intelligence: Detect "attack" or "steal" keywords
        const isRisk = input.toLowerCase().includes('attack') || input.toLowerCase().includes('steal');

        return {
            riskScore: isRisk ? 0.95 : 0.05,
            flags: isRisk ? ['MALICIOUS_INTENT', 'KEYWORD_MATCH'] : [],
            summary: isRisk ? 'High probabilty of malicious intent detected.' : 'Content appears benign.',
            confidence: 0.88
        };
    }
}
