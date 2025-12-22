import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeSecurityService } from './node_security.service';
import { NodeSecurityController, EpochController } from './node_security.controller';
import { ValidationNode } from './entities/validation_node.entity';
import { SecurityDeposit } from './entities/security_deposit.entity';
import { Epoch } from './entities/epoch.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ValidationNode, SecurityDeposit, Epoch])],
    controllers: [NodeSecurityController, EpochController],
    providers: [NodeSecurityService],
    exports: [NodeSecurityService],
})
export class NodeSecurityModule { }
