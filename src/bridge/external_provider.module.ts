import { Module } from '@nestjs/common';
import { ExternalProviderContract } from './external_provider.contract';

@Module({
    providers: [ExternalProviderContract],
    exports: [ExternalProviderContract],
})
export class ExternalProviderModule { }
