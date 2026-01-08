import { Test, TestingModule } from '@nestjs/testing';
import { ActiveAgentService } from '../../../src/ai_agents/active_agent.service';
import { GeminiProvider } from '../../../src/ai_agents/providers/gemini.provider';
import { OpenAiProvider } from '../../../src/ai_agents/providers/openai.provider';
import { IbmWatsonProvider } from '../../../src/ai_agents/providers/ibm_watson.provider';
import { GrokProvider } from '../../../src/ai_agents/providers/grok.provider';
import { AmazonBedrockProvider } from '../../../src/ai_agents/providers/amazon_bedrock.provider';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ActiveAgentService', () => {
    let service: ActiveAgentService;
    let eventEmitter: EventEmitter2;
    let gemini: GeminiProvider;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ActiveAgentService,
                {
                    provide: GeminiProvider,
                    useValue: { getProviderId: () => 'GEMINI', analyzeText: jest.fn(), scoreEvent: jest.fn() }
                },
                {
                    provide: OpenAiProvider,
                    useValue: { getProviderId: () => 'OPENAI', analyzeText: jest.fn() }
                },
                {
                    provide: IbmWatsonProvider,
                    useValue: { getProviderId: () => 'IBM_WATSON', analyzeText: jest.fn() }
                },
                {
                    provide: GrokProvider,
                    useValue: { getProviderId: () => 'GROK', analyzeText: jest.fn() }
                },
                {
                    provide: AmazonBedrockProvider,
                    useValue: { getProviderId: () => 'AMAZON_BEDROCK', analyzeText: jest.fn() }
                },
                {
                    provide: EventEmitter2,
                    useValue: { emit: jest.fn() }
                }
            ],
        }).compile();

        service = module.get<ActiveAgentService>(ActiveAgentService);
        eventEmitter = module.get<EventEmitter2>(EventEmitter2);
        gemini = module.get<GeminiProvider>(GeminiProvider);

        service.onModuleInit();
    });

    it('should define service', () => {
        expect(service).toBeDefined();
    });

    it('should trigger analysis on proposal creation', async () => {
        const mockProposal = { id: 'P-1', title: 'Attack Proposal', description: 'Steal funds' };

        // Mock Gemini response (Simulating High Risk)
        (gemini.analyzeText as jest.Mock).mockResolvedValue({
            riskScore: 0.9,
            flags: ['MALICIOUS'],
            summary: 'Dangerous',
            confidence: 0.99
        });

        await service.handleProposalCreated(mockProposal);

        expect(gemini.analyzeText).toHaveBeenCalledWith('Attack Proposal Steal funds');
        expect(eventEmitter.emit).toHaveBeenCalledWith('agent.fraud.signal', expect.objectContaining({
            type: 'PROPOSAL_RISK',
            targetId: 'P-1'
        }));
    });
});
