import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AiProviderInterface } from './interfaces/ai_provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { IbmWatsonProvider } from './providers/ibm_watson.provider';
import { GrokProvider } from './providers/grok.provider';
import { AmazonBedrockProvider } from './providers/amazon_bedrock.provider';

@Injectable()
export class ActiveAgentService implements OnModuleInit {
    private readonly logger = new Logger(ActiveAgentService.name);
    private providers: Map<string, AiProviderInterface> = new Map();
    private activeProviderId = 'GEMINI'; // Default

    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly gemini: GeminiProvider,
        private readonly openai: OpenAiProvider,
        private readonly watson: IbmWatsonProvider,
        private readonly grok: GrokProvider,
        private readonly bedrock: AmazonBedrockProvider
    ) { }

    onModuleInit() {
        this.registerProvider(this.gemini);
        this.registerProvider(this.openai);
        this.registerProvider(this.watson);
        this.registerProvider(this.grok);
        this.registerProvider(this.bedrock);
        this.logger.log(`ActiveAgentService initialized with ${this.providers.size} providers. Default: ${this.activeProviderId}`);
    }

    private registerProvider(provider: AiProviderInterface) {
        this.providers.set(provider.getProviderId(), provider);
    }

    public setActiveProvider(providerId: string) {
        if (this.providers.has(providerId)) {
            this.activeProviderId = providerId;
            this.logger.log(`Switched Active AI Provider to ${providerId}`);
        } else {
            this.logger.warn(`Provider ${providerId} not found.`);
        }
    }

    /**
     * Listener: Governance Proposal Created
     * Action: Analyze proposal text for malicious content
     */
    // Assuming the event name from recent Governance refactor is not explicitly emitted yet for creation, 
    // I need to ensure GovernanceService emits 'governance.proposal.created'.
    // For now, I will listen to a hypothetical event or add the emit in GovernanceService later.
    // Let's assume 'governance.proposal.created' will be the event.
    @OnEvent('governance.proposal.created')
    async handleProposalCreated(payload: any) {
        this.logger.log(`[Agent] Detected new proposal: ${payload.title}. Initiating Analysis...`);

        const provider = this.providers.get(this.activeProviderId);
        const analysis = await provider.analyzeText(`${payload.title} ${payload.description}`);

        this.logger.log(`[Agent] Analysis Result: Risk=${analysis.riskScore}, Summary=${analysis.summary}`);

        if (analysis.riskScore > 0.8) {
            this.logger.warn(`[Agent] HIGH RISK PROPOSAL DETECTED. Emitting FRAUD_SIGNAL.`);
            this.eventEmitter.emit('agent.fraud.signal', {
                type: 'PROPOSAL_RISK',
                source: 'ActiveAgentService',
                targetId: payload.id,
                details: analysis
            });
        }
    }

    /**
     * Listener: Anomaly Detected (Passive Layer)
     * Action: Deep verify
     */
    @OnEvent('supervisory.anomaly_detected')
    async handleAnomalyOrAnomalyLog(payload: any) {
        // payload might be the Entity or an object
        this.logger.log(`[Agent] Received Anomaly Signal: ${payload.type}. Cross-referencing with AI...`);

        const provider = this.providers.get(this.activeProviderId);
        const analysis = await provider.scoreEvent(payload);

        if (analysis.riskScore > 0.9) {
            this.logger.error(`[Agent] CONFIRMED ANOMALY via AI. Escalating to Governance Freeze Protocol...`);
            // In a real system, this would call GovernanceService.freezeProposal directly or via event
            this.eventEmitter.emit('agent.escalation.freeze_request', {
                reason: 'AI_CONFIRMED_ANOMALY',
                originalData: payload
            });
        }
    }
}
