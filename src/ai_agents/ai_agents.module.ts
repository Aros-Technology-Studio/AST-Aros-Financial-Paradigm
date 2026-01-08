import { Module } from '@nestjs/common';
import { ActiveAgentService } from './active_agent.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { IbmWatsonProvider } from './providers/ibm_watson.provider';
import { GrokProvider } from './providers/grok.provider';
import { AmazonBedrockProvider } from './providers/amazon_bedrock.provider';

@Module({
    providers: [
        ActiveAgentService,
        GeminiProvider,
        OpenAiProvider,
        IbmWatsonProvider,
        GrokProvider,
        AmazonBedrockProvider
    ],
    exports: [ActiveAgentService]
})
export class AiAgentsModule { }
