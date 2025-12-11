import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OversightController } from './oversight.controller';
import { OversightService } from './oversight.service';
import { OversightLog } from './entities/oversight_log.entity';

@Module({
    imports: [TypeOrmModule.forFeature([OversightLog])],
    controllers: [OversightController],
    providers: [OversightService],
    exports: [OversightService],
})
export class OversightModule { }
