export interface AnalysisResult {
    riskScore: number; // 0.0 to 1.0
    flags: string[];
    summary: string;
    confidence: number;
}

export interface AiProviderInterface {
    /**
     * Unique identifier for the provider (e.g., 'GEMINI', 'OPENAI')
     */
    getProviderId(): string;

    /**
     * Analyze a text payload (e.g., Proposal Description)
     */
    analyzeText(prompt: string): Promise<AnalysisResult>;

    /**
     * Score a structured transaction or event
     */
    scoreEvent(eventData: any): Promise<AnalysisResult>;
}
