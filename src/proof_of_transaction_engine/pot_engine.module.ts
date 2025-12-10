import { Module } from '@nestjs/common';
import { PoTService } from './pot.service';

@Module({
    providers: [PoTService],
    exports: [PoTService],
})
export class PoTEngineModule { }
