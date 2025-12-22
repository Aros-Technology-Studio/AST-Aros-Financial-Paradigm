import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidatorService } from './validator.service';
import { ValidatorController, EpochController } from './validator.controller';
import { Validator } from './entities/validator.entity';
import { Stake } from './entities/stake.entity';
import { Epoch } from './entities/epoch.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Validator, Stake, Epoch])],
    controllers: [ValidatorController, EpochController],
    providers: [ValidatorService],
    exports: [ValidatorService],
})
export class ValidatorModule { }
