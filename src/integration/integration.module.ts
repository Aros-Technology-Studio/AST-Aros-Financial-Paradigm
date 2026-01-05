import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmartContractIntegration } from './smart_contract.integration';
import { SmartContractEventEntity } from './entities/smart_contract_event.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([SmartContractEventEntity])
    ],
    providers: [SmartContractIntegration],
    exports: [SmartContractIntegration]
})
export class IntegrationModule { }
